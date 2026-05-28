# Workflow Runtime Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Workflow Runtime Platform Core with a reusable runtime API module and workflow-service runtime execution, metrics, and observability.

**Architecture:** `workflow-runtime-api` defines the public node/runtime protocol. `workflow-service` owns the runtime state machine, DAG execution, retry control, runtime events, metrics, observability, and REST endpoints. Nodes stay decoupled and are discovered through `NodeRegistry`.

**Tech Stack:** Java 17, Maven multi-module, Spring Boot 3.2, JUnit 5, AssertJ, MyBatis Plus, Spring MVC.

---

### Task 1: Runtime API Module

**Files:**
- Modify: `pom.xml`
- Create: `backend/workflow-runtime-api/pom.xml`
- Create: `backend/workflow-runtime-api/src/main/java/com/aetherflow/workflow/runtime/api/*.java`
- Test: `backend/workflow-runtime-api/src/test/java/com/aetherflow/workflow/runtime/api/*.java`

- [ ] Add failing tests for `NodeType`, `NodeRegistry`, `RetryPolicy`, and immutable/read-only `NodeResult` behavior.
- [ ] Run `mvn -pl backend/workflow-runtime-api -am test` and confirm compilation fails because the API classes do not exist.
- [ ] Implement the API classes with no Spring dependency.
- [ ] Run `mvn -pl backend/workflow-runtime-api -am test` and confirm tests pass.

### Task 2: Runtime State And Context

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/core/DefaultWorkflowContext.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/core/RuntimeStateMachine.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/core/*Test.java`

- [ ] Add failing tests proving legal state transitions work and illegal transitions throw.
- [ ] Add failing tests proving `variables` are mutable/thread-safe while `nodeOutputs` are read-only to node callers.
- [ ] Implement `DefaultWorkflowContext` and `RuntimeStateMachine`.
- [ ] Run `mvn -pl backend/workflow-service -am test` and confirm these tests pass.

### Task 3: DAG Runtime Engine

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/WorkflowDag.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeRequest.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowExecutionSnapshot.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngineTest.java`

- [ ] Add failing tests for sequential DAG traversal.
- [ ] Add failing tests for branch traversal via `NodeResult.branchKey` and `node.config.branches`.
- [ ] Add failing tests for missing executor failure.
- [ ] Implement DAG parsing without modifying `WorkflowDefinitionDTO` or `WorkflowNodeDTO`.
- [ ] Implement engine execution through `NodeRegistry` only.
- [ ] Run `mvn -pl backend/workflow-service -am test`.

### Task 4: Retry, Events, Metrics, Observability

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/*.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/metrics/*.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/observability/*.java`
- Test: matching `src/test/java` files.

- [ ] Add failing tests proving runtime retries node exceptions according to `RetryPolicy`.
- [ ] Add failing tests proving retry exhaustion fails workflow and increments fail count.
- [ ] Add failing tests proving events are stored in order for each workflow.
- [ ] Implement in-memory metrics and observation stores with `ConcurrentHashMap`, `LongAdder`, and immutable snapshots.
- [ ] Run `mvn -pl backend/workflow-service -am test`.

### Task 5: Spring Wiring And REST API

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java`
- Modify: `backend/workflow-service/pom.xml`
- Modify: `backend/workflow-service/src/main/resources/application.yml`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeControllerTest.java`

- [ ] Add failing MVC/controller tests for `/workflow/runtime/metrics`, `/workflow/runtime/observability/{workflowId}`, and `/workflow/runtime/events/{workflowId}`.
- [ ] Wire `NodeRegistry` from Spring `List<NodeExecutor>`.
- [ ] Add runtime properties and logging pattern with MDC fields.
- [ ] Implement controller methods returning `Result<T>`.
- [ ] Run `mvn -pl backend/workflow-service -am test`.

### Task 6: WorkflowService Integration And Final Verification

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowServiceImplTest.java`
- Modify: `docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md`
- Modify: `docs/agent/logs/2026-05-28.md`
- Modify: `AGENT.md`

- [ ] Add failing service tests proving `startInstance` creates an instance and delegates lifecycle to `WorkflowRuntimeEngine`.
- [ ] Update `WorkflowServiceImpl` to persist initial state, execute runtime, then persist final state/current node.
- [ ] Run `git diff --name-only main...HEAD`.
- [ ] Run `git diff --check`.
- [ ] Run `mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test`.
- [ ] Update task docs, logs, test records, handoff, and release file locks.
