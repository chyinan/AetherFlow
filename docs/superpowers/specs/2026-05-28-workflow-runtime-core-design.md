# Workflow Runtime Core Design

## Scope

This task builds the Workflow Runtime Platform Core. The runtime owns scheduling, state transitions, context lifecycle, retry decisions, runtime events, metrics, and observability. Business node behavior remains outside the runtime.

Runtime must not know how Whisper, Summary, Export, Notify, or any other business node works. Node developers extend the platform by depending on `workflow-runtime-api` and registering `NodeExecutor` implementations.

## Runtime Boundary

Runtime controls:
- Workflow lifecycle: `PENDING`, `RUNNING`, `RETRYING`, `SUCCESS`, `FAILED`, `CANCELLED`.
- DAG traversal and next-node resolution.
- Node lookup through `NodeRegistry`.
- Retry policy, retry delay, and final failure.
- Runtime event publication.
- WorkflowContext creation, mutation rules, and snapshots.
- Runtime logs, metrics, and observability state.

Runtime does not control:
- Business logic inside a node.
- AI provider choice.
- File export, notify delivery, summary prompt logic, or Whisper execution.
- Existing common DTO shape, database schema, Gateway routes, or MQ shared names.

## Node Boundary

Nodes implement:
- `NodeExecutor#nodeType()`
- `NodeExecutor#execute(WorkflowContext context)`

Node code may read and write `WorkflowContext.variables`. Node code may read node outputs and runtime identity fields. Node code cannot mutate `RuntimeState`, `currentNodeId`, workflow lifecycle, retry count, or runtime event state.

All node dispatch goes through `NodeRegistry`. No workflow service code should add giant `switch` or `if/else` blocks for node types.

## Context Protocol

`WorkflowContext` exposes:
- `workflowId`
- `traceId`
- `taskId`
- `variables`
- `nodeOutputs`
- `runtimeState`
- `currentNodeId`

`variables` is backed by a concurrent map and is the only shared mutable channel available to nodes. `nodeOutputs` is read-only to nodes. Runtime internals own current node, node output recording, and state transitions.

## API Module

Create `backend/workflow-runtime-api` as a Java 17 Maven module. It contains:
- `NodeExecutor`
- `WorkflowContext`
- `RuntimeEvent`
- `RuntimeEventType`
- `NodeType`
- `NodeResult`
- `RuntimeState`
- `RetryPolicy`
- `NodeRegistry`
- `RuntimeEventPublisher`

`NodeType` is a value object rather than a fixed enum so custom node types can be registered without changing the runtime API module.

## Runtime Engine

`WorkflowRuntimeEngine` lives in `workflow-service`. It receives a workflow definition, runtime identity, initial variables, and a retry policy. It creates a runtime context, transitions from `PENDING` to `RUNNING`, executes DAG nodes through `NodeRegistry`, records outputs, merges returned variables, publishes events, and finishes as `SUCCESS` or `FAILED`.

DAG resolution is compatible with the current `WorkflowDefinitionDTO` shape:
- `nodes` order provides a sequential fallback.
- `node.config.next` may point to one successor.
- `node.config.nextNodes` may point to multiple successors.
- `node.config.branches` maps a `NodeResult.branchKey` to a successor.
- `node.config.defaultNext` is used when no branch matches.

This avoids modifying public DTOs while allowing branch-capable workflows.

## Retry

Nodes throw exceptions. Runtime decides whether to retry using `RetryPolicy`. Runtime publishes retry events and updates retry metrics. Exhausted retry attempts move the workflow to `FAILED`.

Default retry policy is conservative and configurable from `workflow-service` application.yml.

## Events And MQ

Runtime emits `RuntimeEvent` for:
- `WORKFLOW_STARTED`
- `NODE_STARTED`
- `NODE_COMPLETED`
- `NODE_RETRYING`
- `WORKFLOW_FAILED`
- `WORKFLOW_COMPLETED`
- `WORKFLOW_CANCELLED`

The API module defines `RuntimeEventPublisher`. `workflow-service` provides a composite publisher that always records events for observability and can optionally publish to RabbitMQ when explicitly enabled by configuration. This does not declare new queues or alter existing MQ shared names.

## Metrics

Add `/workflow/runtime/metrics`, returning:
- current workflow count
- node TPS
- retry count
- fail count

Metrics are in-memory for this task. They are thread-safe and designed so a later persistence backend can replace the implementation without changing the runtime API.

## Observability

Add:
- `/workflow/runtime/observability/{workflowId}` for current node, progress, state, and node statuses.
- `/workflow/runtime/events/{workflowId}` for recent runtime events.

The first implementation uses an in-memory observation store. It is safe for concurrent workflows and avoids database changes.

## Logging

Runtime logs must include:
- `traceId`
- `workflowId`
- `nodeId`
- `taskId`

Runtime code uses MDC around workflow/node execution and updates `workflow-service` logging pattern accordingly.

## Validation

Primary verification:
- `git diff --name-only main...HEAD`
- `git diff --check`
- `mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test`

Unified VM follow-up:
- Start workflow-service with infrastructure on `192.168.101.68`.
- Call `/workflow/runtime/metrics`.
- Call observability and events endpoints for a test workflow.
