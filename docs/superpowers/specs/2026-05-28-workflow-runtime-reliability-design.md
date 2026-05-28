# Workflow Runtime Reliability Design

## Scope

This task extends the existing Workflow Runtime Core with enterprise reliability capabilities. The work is intentionally staged so each phase remains runnable and testable:

1. Real DAG parallel scheduling and fan-in join.
2. Runtime snapshot persistence and restart recovery.
3. Durable Runtime Event Stream.
4. Cross-process workflow lock.

Phase 1 is implemented first. Later phases use the same boundaries and storage contracts defined here.

## Runtime Boundary

Runtime owns:
- DAG validation, edge resolution, ready-node calculation, fan-out, join, and scheduling.
- Runtime state transitions for `PENDING`, `RUNNING`, `RETRYING`, `SUCCESS`, `FAILED`, and `CANCELLED`.
- Retry decisions, retry delay, and final workflow failure.
- WorkflowContext mutation rules, node output recording, variable merge, and snapshot creation.
- Runtime event publication and persistence.
- Recovery of `RUNNING` and `RETRYING` workflows after service restart.
- Cross-process lock acquire, renew, release, and timeout semantics.

Runtime does not own:
- Whisper, Summary, Export, Notify, or any business node behavior.
- AI provider routing, file storage, notification delivery, or task-service dispatch.
- Public DTO shape in `backend/common`.
- Existing MQ exchange, routing key, queue, or payload contracts.
- Gateway routes or other service contracts.

## Node Boundary

`NodeExecutor` remains the only business-node extension point:

- Node code returns `NodeResult` or throws an exception.
- Node code may read `WorkflowContext.variables()` and previous `nodeOutputs()`.
- Node code may return output and variable updates.
- Node code must not set `RuntimeState`, acquire workflow locks, publish lifecycle events directly, or choose downstream scheduling.

`NodeResult.branchKey` is only a branch decision value. Runtime maps it through the DAG definition. If `NodeResult.nextNodeId` is kept for compatibility, Runtime must validate the target against declared edges before scheduling it.

## Parallel DAG Scheduling Model

`WorkflowDag` becomes a graph model instead of only a next-node resolver:

- `nodesById`: node id to node DTO.
- `outgoingEdges`: node id to successor ids.
- `incomingEdges`: node id to predecessor ids.
- `startNodeIds`: nodes with no predecessors.
- `predecessorCount`: join readiness counter.

The scheduler is Runtime-controlled:

1. Build and validate the DAG from `WorkflowDefinitionDTO.nodes`.
2. Submit every start node to a bounded `ExecutorService`.
3. When a node completes, record its output, merge variables, publish events, and mark the node completed.
4. Decrement successor predecessor counters.
5. Schedule a successor only when all predecessors are completed.
6. If one branch fails after retry exhaustion, stop scheduling new nodes, wait for already submitted nodes to settle, and transition the workflow to `FAILED`.

This supports fan-out and fan-in without business nodes calling downstream nodes. The design avoids node-type switch statements by continuing to dispatch through `NodeRegistry`.

## Variable Merge Rule

Parallel branches can complete in any order, so returned variable maps cannot silently overwrite each other. Runtime will merge node variables into the shared context with a deterministic guard:

- New key: accepted.
- Existing key with equal value: accepted.
- Existing key with different value from a different node: Runtime fails the workflow with a variable conflict.

This is stricter than completion-order overwrite and prevents nondeterministic runtime state.

## Recovery Model

Runtime snapshot persistence is introduced in phase 2. A snapshot captures enough information to rebuild scheduler state without asking business nodes:

- `workflowId`
- `traceId`
- `taskId`
- `definitionId`
- `definitionJson`
- `runtimeState`
- `currentNodeIds`
- `completedNodeIds`
- `failedNodeIds`
- `variablesJson`
- `nodeOutputsJson`
- `lastEventId`
- `updatedAt`

On service startup, recovery scans workflows in `RUNNING` or `RETRYING` state. Runtime acquires the workflow lock, loads the latest snapshot, rebuilds the DAG, skips completed nodes, recomputes ready nodes, and resumes execution. In-flight nodes with no completed output are treated as not completed and may be executed again; real node implementations must remain idempotent for external side effects.

### Snapshot Table

`af_workflow_runtime_snapshot` is required because `WorkflowExecutionSnapshot` is currently only an in-memory return value.

```sql
CREATE TABLE IF NOT EXISTS af_workflow_runtime_snapshot (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_id VARCHAR(64) NOT NULL,
    trace_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    definition_id BIGINT,
    definition_json LONGTEXT NOT NULL,
    runtime_state VARCHAR(32) NOT NULL,
    current_node_ids_json LONGTEXT,
    completed_node_ids_json LONGTEXT,
    failed_node_ids_json LONGTEXT,
    variables_json LONGTEXT,
    node_outputs_json LONGTEXT,
    last_event_id VARCHAR(64),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workflow_runtime_snapshot_workflow (workflow_id),
    KEY idx_af_workflow_runtime_snapshot_state (runtime_state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Event Stream Persistence Model

`RuntimeEvent` is already serializable as a record-like protocol object, but the current observation store is in memory. Phase 3 adds a persistent event store and keeps the existing optional MQ publisher unchanged.

### Event Table

`af_workflow_runtime_event` is required so `/workflow/runtime/events/{workflowId}` can survive restarts and observability can rebuild from the event stream.

```sql
CREATE TABLE IF NOT EXISTS af_workflow_runtime_event (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_id VARCHAR(64) NOT NULL,
    workflow_id VARCHAR(64) NOT NULL,
    trace_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(64),
    node_id VARCHAR(128),
    event_type VARCHAR(64) NOT NULL,
    runtime_state VARCHAR(32) NOT NULL,
    attributes_json LONGTEXT,
    occurred_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workflow_runtime_event_id (event_id),
    KEY idx_af_workflow_runtime_event_workflow (workflow_id, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

`RuntimeEventStore` provides append and query-by-workflow APIs. `PersistentRuntimeEventPublisher` is added to the existing `CompositeRuntimeEventPublisher`. MQ names and payload contracts are not modified.

## Cross-Process Lock Model

Phase 4 uses Redis as the primary workflow lock:

- Key: `aetherflow:workflow:runtime:lock:{workflowId}`
- Value: random worker token.
- Acquire: `SET key token NX PX ttlMillis`.
- Renew: Lua script renews TTL only when stored token equals worker token.
- Release: Lua script deletes only when stored token equals worker token.
- Timeout: Redis TTL releases locks after worker crash.

Redis is preferred over a DB optimistic lock because workflow execution is a lease/coordination problem, not durable data ownership. Redis gives native TTL expiry and cheap renew operations. A DB lock fallback would be more durable but needs polling cleanup and increases write pressure on MySQL.

## Public Surface

Allowed public surface changes are limited to workflow runtime:

- `workflow-runtime-api` protocol additions if needed for snapshots and event query models.
- `workflow-service` Runtime REST APIs under `/workflow/runtime/**`.
- workflow-service-owned DB tables and Redis keys described above.

No public DTO in `backend/common` is changed.

## Validation

Required final verification:

```powershell
git diff --check
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test
```

Required test coverage:
- Parallel branches execute concurrently.
- Fan-in join waits for all predecessor nodes.
- Node failure retries and then either succeeds or fails the workflow.
- Runtime restart recovers `RUNNING` and `RETRYING` workflows.
- Event Stream can be queried by workflow id.
- Cross-process lock prevents two workers from running the same workflow.
- Lock TTL releases after abnormal worker exit.

## Risks

- Parallel variable writes can conflict; Runtime will fail fast instead of silently overwriting.
- Recovery may re-run in-flight nodes after restart; external side-effect nodes must be idempotent.
- DB table creation is a workflow-service contract change and must be applied in the unified environment.
- Redis lock depends on Redis availability; final verification needs the unified environment on `192.168.101.68`.
- Long-running nodes cannot be forcibly interrupted safely by Runtime if they ignore thread interruption.
