# Workflow Node Ecosystem Design

## Scope

This task builds the Workflow Node Ecosystem on top of the existing `workflow-runtime-api` and `workflow-service` runtime. The runtime core stays unchanged. Nodes are plugins that execute business logic, return `NodeResult`, and let Runtime handle DAG traversal, retry, state transitions, and lifecycle.

The feature set covers:
- Node registry and base executor abstraction.
- START, END, UPLOAD, WHISPER, SUMMARY, EXPORT, NOTIFY, CONDITION, and MOCK node executors.
- Internal service clients for file, AI, and notify interactions.
- Node metrics at `/workflow/node/metrics`.
- Service configuration for node integrations and MinIO export.

## Hard Boundaries

Runtime owns:
- `RuntimeState` transitions.
- DAG scheduling and branch resolution.
- Retry policy and retry loop.
- Workflow lifecycle.
- Event publication and snapshot handling.

Nodes own:
- Business logic only.
- Reading `WorkflowContext.variables()`, `nodeOutputs()`, `workflowId`, `traceId`, `taskId`, and `currentNodeId`.
- Returning `NodeResult` with output and variable updates.

Nodes do not:
- Mutate `RuntimeState`.
- Control DAG traversal.
- Manage retry.
- Publish workflow lifecycle events.

`workflow-runtime-api` is not modified. `NodeType` remains a value object and node registration uses `NodeType.of("...")` constants in workflow-service.

## Node Configuration Model

`WorkflowContext` does not expose the current `WorkflowNodeDTO.config`, so workflow-service injects node configuration into initial workflow variables when a workflow starts.

Shared variable key:
- `__workflowNodeConfigs`

Shape:
- `Map<String, Map<String, Object>>`
- keyed by `nodeId`
- value is the node’s config map copied from `WorkflowDefinitionDTO`

This lets each NodeExecutor resolve its own configuration without changing `WorkflowContext`.

## Node Architecture

### BaseNodeExecutor

`BaseNodeExecutor` is the shared parent class for all nodes in workflow-service.

Responsibilities:
- validate context and config.
- resolve node config from workflow variables.
- wrap logs with trace/workflow/node identifiers.
- record node metrics.
- build `NodeResult`.

It does not:
- Catch and swallow business failures.
- Retry execution.
- manipulate runtime state.

### Node Type Catalog

workflow-service provides a local catalog of supported node types:
- `START`
- `END`
- `UPLOAD`
- `WHISPER`
- `SUMMARY`
- `EXPORT`
- `NOTIFY`
- `CONDITION`
- `MOCK`

## Node Behavior

### START / END

Thin lifecycle nodes.
- `START` can expose the initial input snapshot and prepare derived variables.
- `END` can summarize the terminal workflow payload.
- Neither node mutates runtime control flow.

### CONDITION

Branch decision node.
- Reads node config and context variables.
- Evaluates a simple comparison rule.
- Returns `NodeResult.branchKey`.
- Runtime maps the branch through the DAG definition.

Supported rule shape:
- `variable`
- `operator`
- `value`
- `trueBranch`
- `falseBranch`

### UPLOAD

File input node.
- Resolves `fileId` from node config or workflow variables.
- Calls file-service internal metadata API.
- Returns file metadata in `NodeResult.output`.
- Writes normalized file metadata and `fileUrl` into workflow variables.

### WHISPER

Audio transcription node.
- Resolves audio source from workflow variables or file metadata.
- Calls ai-service internal workflow node endpoint.
- Uses the existing AI ASR executor on the ai-service side.
- Writes transcription text and related fields into workflow variables.
- Does not modify runtime state.

### SUMMARY

Summary node.
- Builds a prompt from node config and workflow variables.
- Calls ai-service internal workflow node endpoint.
- Uses the existing AI provider router on the ai-service side.
- Supports language selection through node config.
- Writes summary text into workflow variables.

### EXPORT

Export node.
- Builds Markdown, TXT, or JSON export content.
- Writes export content to MinIO.
- Registers the exported object through file-service internal metadata API.
- Returns export metadata and file reference variables.

### NOTIFY

Completion notification node.
- Calls notify-service internal send API.
- Sends workflow completion context and payload.
- Returns notification metadata in `NodeResult.output`.

### MOCK

Placeholder node for future OCR, embedding, and video generation flows.
- Can delay, fail, echo payload, or emit configured output.
- Used for testing and future extension points.

## Service Contracts

### workflow-service

- `/workflow/node/metrics`
- workflow startup injects `__workflowNodeConfigs`
- `workflow-service` registers all node executors as Spring beans

### file-service

- `GET /internal/files/metadata/{fileId}`
- continues to use `X-Internal-File-Token`

### ai-service

- `POST /ai/internal/workflow/nodes/execute`
- reuses existing AI node executors and provider router

### common DTOs

Add cross-service DTOs for the internal AI workflow node endpoint:
- `AiWorkflowNodeRequestDTO`
- `AiWorkflowNodeResponseDTO`

## Metrics

`/workflow/node/metrics` returns:
- node execution count
- retry count
- fail count

Counting model:
- execution count increments on every `NodeExecutor.execute()` invocation.
- retry count increments when `WorkflowContext.runtimeState()` is `RETRYING`.
- fail count increments when node execution throws.

## Configuration

workflow-service `application.yml` gains:
- `aetherflow.workflow.node.*`
- `aetherflow.minio.*`
- `aetherflow.file.internal-token`

These values let workflow-service call file-service, ai-service, notify-service, and MinIO without touching runtime core.

## Validation

Primary verification:
- `git diff --check`
- `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test`

Targeted checks:
- node config extraction test.
- upload metadata client test.
- whisper and summary executor tests.
- export MinIO/file-registration test.
- node metrics controller test.

Unified environment follow-up:
- start workflow-service with file-service, ai-service, notify-service, MySQL, Redis, Nacos, and MinIO available.
- run a sample workflow containing UPLOAD -> WHISPER -> SUMMARY -> EXPORT -> NOTIFY.

## Risks

- `WorkflowContext` has no node-config field, so the config-in-variables convention must stay stable.
- Export needs MinIO access in workflow-service; local tests should mock storage.
- AI summary support depends on an internal ai-service endpoint that wraps the existing provider router.
- `NodeType` is not an enum in the runtime API, so node type expansion must use `NodeType.of(...)` values.
