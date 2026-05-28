# Workflow Runtime Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enterprise reliability to Workflow Runtime Core, starting with true parallel DAG scheduling and fan-in join.

**Architecture:** Runtime remains the only scheduler and state owner. The DAG engine computes ready nodes from graph predecessor state, executes nodes through `NodeRegistry`, publishes runtime events, and records deterministic snapshots for later recovery. Persistence and locking are introduced as workflow-service-owned adapters behind small interfaces.

**Tech Stack:** Java 17, Maven, Spring Boot 3.2, JUnit 5, AssertJ, Mockito, MyBatis Plus, Redis via Spring Data Redis in the lock phase.

---

## File Structure

- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/WorkflowDag.java`
  - Owns graph parsing, declared-edge validation, predecessor/successor lookup, and start-node calculation.
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java`
  - Owns scheduler lifecycle, parallel execution, retry/fail state, event emission, and final snapshot.
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowExecutionSnapshot.java`
  - Adds current/completed/failed node collections needed by parallel runtime and later recovery.
- Create later: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/DagExecutionState.java`
  - Thread-safe phase 1 scheduler state if `WorkflowRuntimeEngine` becomes too large.
- Create later: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/*`
  - Snapshot and event stream repositories for phases 2 and 3.
- Create later: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/*`
  - Redis lock implementation for phase 4.

---

### Task 1: Parallel DAG Graph Model

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/WorkflowDag.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/dag/WorkflowDagTest.java`

- [ ] **Step 1: Write failing graph tests**

Add tests proving `WorkflowDag` exposes start nodes, predecessors, successors, and join readiness inputs.

```java
@Test
void exposesPredecessorsForFanInJoin() {
    WorkflowDag dag = WorkflowDag.from(definition(
            node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
            node("left", "LEFT", Map.of("next", "join")),
            node("right", "RIGHT", Map.of("next", "join")),
            node("join", "JOIN", Map.of())
    ));

    assertThat(dag.startNodeIds()).containsExactly("start");
    assertThat(dag.nextNodeIds("start", NodeResult.success(Map.of())))
            .containsExactly("left", "right");
    assertThat(dag.predecessorNodeIds("join")).containsExactlyInAnyOrder("left", "right");
    assertThat(dag.requiredPredecessorCount("join")).isEqualTo(2);
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=WorkflowDagTest test
```

Expected: FAIL because `startNodeIds`, `predecessorNodeIds`, and `requiredPredecessorCount` do not exist.

- [ ] **Step 3: Implement graph indexes**

Add immutable `outgoingEdges`, `incomingEdges`, and `startNodeIds` to `WorkflowDag`. Keep existing `nextNodeIds(nodeId, result)` behavior for branch compatibility, but validate that every returned target is a declared graph target.

- [ ] **Step 4: Run GREEN**

Run the same Maven command and confirm `WorkflowDagTest` passes.

### Task 2: Parallel Branch Execution

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java`

- [ ] **Step 1: Write failing parallel execution test**

Add a test where two branch nodes wait on a latch and prove they are both in flight before either completes.

```java
@Test
void executesFanOutBranchesConcurrently() {
    CountDownLatch bothStarted = new CountDownLatch(2);
    CountDownLatch releaseBranches = new CountDownLatch(1);
    Set<String> started = ConcurrentHashMap.newKeySet();

    NodeRegistry registry = new NodeRegistry(List.of(
            executor("START", context -> NodeResult.success(Map.of())),
            executor("LEFT", context -> {
                started.add("left");
                bothStarted.countDown();
                await(releaseBranches);
                return NodeResult.success(Map.of("left", true));
            }),
            executor("RIGHT", context -> {
                started.add("right");
                bothStarted.countDown();
                await(releaseBranches);
                return NodeResult.success(Map.of("right", true));
            }),
            executor("JOIN", context -> NodeResult.success(Map.of("joined", true)))
    ));

    CompletableFuture<WorkflowExecutionSnapshot> execution = CompletableFuture.supplyAsync(() ->
            new WorkflowRuntimeEngine(registry).execute(request(definition(
                    node("start", "START", Map.of("nextNodes", List.of("left", "right"))),
                    node("left", "LEFT", Map.of("next", "join")),
                    node("right", "RIGHT", Map.of("next", "join")),
                    node("join", "JOIN", Map.of())
            )))
    );

    assertThat(await(bothStarted)).isTrue();
    assertThat(started).containsExactlyInAnyOrder("left", "right");
    releaseBranches.countDown();
    assertThat(execution.join().runtimeState()).isEqualTo(RuntimeState.SUCCESS);
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeEngineTest#executesFanOutBranchesConcurrently test
```

Expected: FAIL because current readyQueue engine runs `LEFT` and `RIGHT` sequentially.

- [ ] **Step 3: Implement Runtime-owned scheduler**

Replace the single readyQueue loop with a bounded executor and completion service. Track completed nodes in a concurrent set and pending predecessor counts in a concurrent map. Submit successors only when their pending predecessor count reaches zero.

- [ ] **Step 4: Run GREEN**

Run the same test and confirm it passes.

### Task 3: Fan-In Join Waits For All Predecessors

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java`

- [ ] **Step 1: Write failing join ordering test**

Add a test where one branch completes quickly and the other is blocked. Assert the join node does not start until the slow branch is released.

```java
@Test
void fanInJoinWaitsForEveryPredecessor() {
    CountDownLatch fastCompleted = new CountDownLatch(1);
    CountDownLatch releaseSlow = new CountDownLatch(1);
    AtomicBoolean joinStartedBeforeSlow = new AtomicBoolean(false);

    NodeRegistry registry = new NodeRegistry(List.of(
            executor("START", context -> NodeResult.success(Map.of())),
            executor("FAST", context -> {
                fastCompleted.countDown();
                return NodeResult.success(Map.of());
            }),
            executor("SLOW", context -> {
                await(fastCompleted);
                sleep(Duration.ofMillis(50));
                await(releaseSlow);
                return NodeResult.success(Map.of());
            }),
            executor("JOIN", context -> {
                if (releaseSlow.getCount() > 0) {
                    joinStartedBeforeSlow.set(true);
                }
                return NodeResult.success(Map.of());
            })
    ));

    CompletableFuture<WorkflowExecutionSnapshot> execution = runAsync(registry, joinDefinition());
    await(fastCompleted);
    sleep(Duration.ofMillis(100));
    assertThat(joinStartedBeforeSlow).isFalse();
    releaseSlow.countDown();
    assertThat(execution.join().completedNodeIds()).contains("join");
}
```

- [ ] **Step 2: Run RED**

Expected: FAIL until scheduler uses predecessor counts for join readiness.

- [ ] **Step 3: Implement join readiness**

Ensure each successor's predecessor counter is initialized from `WorkflowDag.requiredPredecessorCount(nodeId)` and decremented exactly once per completed predecessor.

- [ ] **Step 4: Run GREEN**

Run `WorkflowRuntimeEngineTest` and confirm existing sequential/branch tests still pass.

### Task 4: Branch Failure Retry And Fail-Fast

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java`

- [ ] **Step 1: Write failing retry success test**

Add a parallel branch test where one branch fails once and succeeds on retry. Assert the workflow reaches `SUCCESS` and retry events are published.

- [ ] **Step 2: Write failing retry exhaustion test**

Add a test where one branch exhausts retry attempts. Assert Runtime publishes `WORKFLOW_FAILED`, returns/throws the same failure behavior as current engine, and never schedules join.

- [ ] **Step 3: Run RED**

Run targeted tests and confirm failures are caused by missing parallel failure coordination.

- [ ] **Step 4: Implement failure coordination**

Use an atomic failure reference. When one node fails after retry exhaustion, stop submitting new nodes, let submitted futures settle, transition Runtime to `FAILED`, publish failure event, and throw.

- [ ] **Step 5: Run GREEN**

Run all `WorkflowRuntimeEngineTest` tests.

### Task 5: Phase 1 Final Verification And Handoff

**Files:**
- Modify: `docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md`
- Modify: `docs/agent/logs/2026-05-28.md`
- Modify: `AGENT.md`

- [ ] Run:

```powershell
git diff --check
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test
```

- [ ] Record test results in task docs and log.
- [ ] Keep task `IN_PROGRESS` if phases 2-4 remain unfinished; do not mark `DONE` after phase 1.

### Later Task 6: Runtime Snapshot Persistence And Recovery

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/RuntimeSnapshotRepository.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/WorkflowRuntimeSnapshot.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/MybatisRuntimeSnapshotRepository.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java`
- Test: matching persistence/recovery tests.

- [ ] TDD snapshot save/load.
- [ ] TDD recovery of `RUNNING` and `RETRYING` workflows from completed/failed/current node sets.
- [ ] TDD variable and node output restoration.

### Later Task 7: Persistent Runtime Event Stream

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/RuntimeEventStore.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/PersistentRuntimeEventPublisher.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java`
- Test: matching event/controller tests.

- [ ] TDD append event.
- [ ] TDD query events by workflow id in occurrence order.
- [ ] TDD rebuild observability from persisted event stream.

### Later Task 8: Redis Workflow Runtime Lock

**Files:**
- Modify: `backend/workflow-service/pom.xml`
- Modify: `backend/workflow-service/src/main/resources/application.yml`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/WorkflowRuntimeLock.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/RedisWorkflowRuntimeLock.java`
- Test: matching lock tests with mocked `StringRedisTemplate`.

- [ ] TDD acquire mutual exclusion for the same workflow id.
- [ ] TDD renew only succeeds for the owner token.
- [ ] TDD release only deletes the owner's lock.
- [ ] TDD TTL timeout allows a later acquire.
