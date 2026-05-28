# Workflow Node Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build workflow-service business NodeExecutors that depend only on `workflow-runtime-api`, while reusing file-service, ai-service, notify-service, and MinIO for external effects.

**Architecture:** workflow-service owns node plugins under `com.aetherflow.workflow.node`. Runtime Core remains unchanged and discovers node executors through the existing `NodeRegistry`. ai-service exposes a thin internal workflow-node endpoint that delegates to the existing AI node executor registry.

**Tech Stack:** Java 17, Spring Boot 3.2, OpenFeign, MinIO Java SDK, JUnit 5, Mockito, AssertJ.

---

## File Structure

- Create: `backend/common/src/main/java/com/aetherflow/common/dto/AiWorkflowNodeRequestDTO.java`
- Create: `backend/common/src/main/java/com/aetherflow/common/dto/AiWorkflowNodeResponseDTO.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/controller/InternalFileController.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/service/FileInfoService.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java`
- Modify: `backend/file-service/src/test/java/com/aetherflow/file/controller/InternalFileControllerTest.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiWorkflowNodeController.java`
- Modify: `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/SummaryNodeExecutor.java`
- Modify: `backend/ai-service/src/main/java/com/aetherflow/ai/prompt/InMemoryPromptTemplateRegistry.java`
- Create: `backend/ai-service/src/test/java/com/aetherflow/ai/controller/AiWorkflowNodeControllerTest.java`
- Modify: `backend/ai-service/src/test/java/com/aetherflow/ai/prompt/PromptRenderServiceTest.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeContextKeys.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeProperties.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/config/WorkflowNodeConfig.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/metrics/WorkflowNodeMetrics.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/metrics/WorkflowNodeMetricsSnapshot.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/controller/WorkflowNodeMetricsController.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/BaseNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/StartNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EndNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ConditionNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/MockNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/UploadNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/WhisperNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/SummaryNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/NotifyNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/client/FileMetadataClient.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/client/AiWorkflowNodeClient.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/client/NotifyInternalClient.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
- Modify: `backend/workflow-service/pom.xml`
- Modify: `backend/workflow-service/src/main/resources/application.yml`
- Create tests under `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/**`

## Task 1: Common DTOs And File Metadata Read API

**Files:**
- Create: `backend/common/src/main/java/com/aetherflow/common/dto/AiWorkflowNodeRequestDTO.java`
- Create: `backend/common/src/main/java/com/aetherflow/common/dto/AiWorkflowNodeResponseDTO.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/controller/InternalFileController.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/service/FileInfoService.java`
- Modify: `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java`
- Modify: `backend/file-service/src/test/java/com/aetherflow/file/controller/InternalFileControllerTest.java`

- [ ] **Step 1: Write failing file metadata read test**

Add to `InternalFileControllerTest`:

```java
@Test
void returnsMetadataWhenInternalTokenMatches() {
    FileInfoService fileInfoService = mock(FileInfoService.class);
    FileInternalProperties properties = new FileInternalProperties();
    properties.setInternalToken("expected-token");
    InternalFileController controller = new InternalFileController(fileInfoService, properties);
    FileMetadataDTO metadata = new FileMetadataDTO(7L, "aetherflow", "objects/audio.mp3",
            "audio.mp3", "audio/mpeg", 1024L, "http://minio/aetherflow/objects/audio.mp3");
    when(fileInfoService.getMetadata(7L)).thenReturn(metadata);

    Result<FileMetadataDTO> result = controller.getMetadata("expected-token", 7L);

    assertThat(result.isSuccess()).isTrue();
    assertThat(result.getData()).isSameAs(metadata);
    verify(fileInfoService).getMetadata(7L);
}
```

- [ ] **Step 2: Run test to verify RED**

Run:

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn -pl backend/file-service -am -Dtest=InternalFileControllerTest test
```

Expected: compile failure because `getMetadata` does not exist.

- [ ] **Step 3: Implement DTOs and file metadata read**

Create `AiWorkflowNodeRequestDTO`:

```java
@Data
public class AiWorkflowNodeRequestDTO {
    @NotBlank
    private String workflowId;
    @NotBlank
    private String traceId;
    private String taskId;
    @NotBlank
    private String nodeId;
    @NotBlank
    private String nodeType;
    private Map<String, Object> payload;
}
```

Create `AiWorkflowNodeResponseDTO`:

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiWorkflowNodeResponseDTO {
    private String nodeType;
    private String status;
    private Map<String, Object> output;
}
```

Add to `FileInfoService`:

```java
FileMetadataDTO getMetadata(Long fileId);
```

Add to `FileInfoServiceImpl`:

```java
@Override
public FileMetadataDTO getMetadata(Long fileId) {
    return toDTO(getAvailableFile(fileId));
}
```

Add to `InternalFileController`:

```java
@GetMapping("/metadata/{fileId}")
public Result<FileMetadataDTO> getMetadata(
        @RequestHeader(value = InternalHeaders.FILE_SERVICE_TOKEN, required = false) String internalToken,
        @PathVariable Long fileId) {
    validateInternalToken(internalToken);
    return Result.success(fileInfoService.getMetadata(fileId));
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
mvn -pl backend/common,backend/file-service -am -Dtest=InternalFileControllerTest test
```

Expected: PASS.

## Task 2: AI Internal Workflow Node Endpoint

**Files:**
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiWorkflowNodeController.java`
- Modify: `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/SummaryNodeExecutor.java`
- Modify: `backend/ai-service/src/main/java/com/aetherflow/ai/prompt/InMemoryPromptTemplateRegistry.java`
- Create: `backend/ai-service/src/test/java/com/aetherflow/ai/controller/AiWorkflowNodeControllerTest.java`

- [ ] **Step 1: Write failing controller test**

Create test:

```java
@Test
void executesWhisperThroughAsrExecutor() {
    AiNodeExecutor asr = new StubExecutor("ASR", Map.of("text", "hello"));
    AiWorkflowNodeController controller = new AiWorkflowNodeController(new DefaultAiNodeExecutorRegistry(List.of(asr)));
    AiWorkflowNodeRequestDTO request = request("WHISPER", Map.of("fileUrl", "http://minio/audio.mp3"));

    Result<AiWorkflowNodeResponseDTO> result = controller.execute(request);

    assertThat(result.isSuccess()).isTrue();
    assertThat(result.getData().getNodeType()).isEqualTo("WHISPER");
    assertThat(result.getData().getOutput()).containsEntry("text", "hello");
}
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/ai-service -am -Dtest=AiWorkflowNodeControllerTest test
```

Expected: compile failure because controller does not exist.

- [ ] **Step 3: Implement controller**

Controller behavior:

```java
@RestController
@RequestMapping("/ai/internal/workflow/nodes")
@RequiredArgsConstructor
public class AiWorkflowNodeController {
    private final DefaultAiNodeExecutorRegistry executorRegistry;

    @PostMapping("/execute")
    public Result<AiWorkflowNodeResponseDTO> execute(@Valid @RequestBody AiWorkflowNodeRequestDTO request) {
        String executorType = "WHISPER".equalsIgnoreCase(request.getNodeType()) ? "ASR" : request.getNodeType();
        AiNodeExecutor executor = executorRegistry.getRequired(executorType);
        TaskMessageDTO taskMessage = new TaskMessageDTO();
        taskMessage.setNodeId(request.getNodeId());
        taskMessage.setNodeType(executorType);
        AiNodeResult result = executor.execute(new AiNodeExecutionContext(taskMessage,
                request.getPayload() == null ? Map.of() : request.getPayload()));
        return Result.success(new AiWorkflowNodeResponseDTO(request.getNodeType(), result.status(), result.output()));
    }
}
```

- [ ] **Step 4: Extend summary prompt language support**

Update summary template:

```java
"You are an enterprise AI workflow assistant. Write a concise summary in {{language}}. {{instruction}}\n{{text}}"
```

Update `SummaryNodeExecutor` variables:

```java
Map.of(
    "text", context.payloadString("text"),
    "language", context.payloadString("language", "English"),
    "instruction", context.payloadString("prompt", "Focus on the key decisions and action items.")
)
```

- [ ] **Step 5: Run GREEN**

Run:

```powershell
mvn -pl backend/ai-service -am -Dtest=AiWorkflowNodeControllerTest,PromptRenderServiceTest test
```

Expected: PASS.

## Task 3: Workflow Node Config Injection

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeContextKeys.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
- Modify: `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowServiceImplTest.java`

- [ ] **Step 1: Write failing WorkflowServiceImpl test**

Extend existing start test:

```java
assertThat(runtimeRequest.getValue().variables())
        .containsKey(WorkflowNodeContextKeys.NODE_CONFIGS);
Map<?, ?> configs = (Map<?, ?>) runtimeRequest.getValue().variables().get(WorkflowNodeContextKeys.NODE_CONFIGS);
assertThat(configs).containsKeys("node-input", "node-summary");
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=WorkflowServiceImplTest test
```

Expected: assertion failure because node configs are not injected.

- [ ] **Step 3: Implement node config injection**

Add constants:

```java
public final class WorkflowNodeContextKeys {
    public static final String NODE_CONFIGS = "__workflowNodeConfigs";
    private WorkflowNodeContextKeys() {}
}
```

Add type catalog:

```java
public final class WorkflowNodeTypes {
    public static final NodeType START = NodeType.of("START");
    public static final NodeType END = NodeType.of("END");
    public static final NodeType UPLOAD = NodeType.of("UPLOAD");
    public static final NodeType WHISPER = NodeType.of("WHISPER");
    public static final NodeType SUMMARY = NodeType.of("SUMMARY");
    public static final NodeType EXPORT = NodeType.of("EXPORT");
    public static final NodeType NOTIFY = NodeType.of("NOTIFY");
    public static final NodeType CONDITION = NodeType.of("CONDITION");
    public static final NodeType MOCK = NodeType.of("MOCK");
    private WorkflowNodeTypes() {}
}
```

In `WorkflowServiceImpl`, build runtime variables:

```java
Map<String, Object> runtimeVariables = new LinkedHashMap<>(input);
runtimeVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, nodeConfigs(definitionDTO));
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=WorkflowServiceImplTest test
```

Expected: PASS.

## Task 4: Metrics, Properties, And BaseNodeExecutor

**Files:**
- Create workflow node properties/config/metrics/base executor classes.
- Create tests under `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/**`

- [ ] **Step 1: Write failing metrics/base executor tests**

Create `BaseNodeExecutorTest` proving:

```java
NodeResult result = executor.execute(context);
assertThat(result.output()).containsEntry("ok", true);
assertThat(metrics.snapshot().executionCount()).isEqualTo(1);
```

Add failure case:

```java
assertThatThrownBy(() -> failing.execute(context)).isInstanceOf(IllegalStateException.class);
assertThat(metrics.snapshot().failCount()).isEqualTo(1);
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=BaseNodeExecutorTest,WorkflowNodeMetricsControllerTest test
```

Expected: compile failure because classes do not exist.

- [ ] **Step 3: Implement metrics and base executor**

Required snapshot:

```java
public record WorkflowNodeMetricsSnapshot(long executionCount, long retryCount, long failCount) {}
```

Required base behavior:

```java
public final NodeResult execute(WorkflowContext context) throws Exception {
    return RuntimeLogContext.supply(context, context.currentNodeId(), () -> {
        metrics.recordExecution(context.runtimeState() == RuntimeState.RETRYING);
        try {
            validate(context);
            return doExecute(context);
        } catch (RuntimeException exception) {
            metrics.recordFailure();
            throw exception;
        }
    });
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=BaseNodeExecutorTest,WorkflowNodeMetricsControllerTest test
```

Expected: PASS.

## Task 5: Structural And Mock Nodes

**Files:**
- Create: `StartNodeExecutor`, `EndNodeExecutor`, `ConditionNodeExecutor`, `MockNodeExecutor`
- Tests: `StructuralNodeExecutorTest`, `ConditionNodeExecutorTest`, `MockNodeExecutorTest`

- [ ] **Step 1: Write failing tests**

Condition test:

```java
NodeResult result = executor.execute(contextWithConfig(Map.of(
        "variable", "status",
        "operator", "EQUALS",
        "value", "READY",
        "trueBranch", "ready",
        "falseBranch", "blocked"
)));
assertThat(result.branchKey()).isEqualTo("ready");
```

Mock test:

```java
NodeResult result = executor.execute(contextWithConfig(Map.of(
        "output", Map.of("ocr", "pending"),
        "variables", Map.of("mockOcr", "pending")
)));
assertThat(result.output()).containsEntry("ocr", "pending");
assertThat(result.variables()).containsEntry("mockOcr", "pending");
```

- [ ] **Step 2: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=StructuralNodeExecutorTest,ConditionNodeExecutorTest,MockNodeExecutorTest test
```

Expected: compile failure.

- [ ] **Step 3: Implement nodes**

Rules:
- START and END return success with config output/variables if present.
- CONDITION returns `branchKey`.
- MOCK can emit output/variables or throw when `fail=true`.

- [ ] **Step 4: Run GREEN**

Run same command. Expected: PASS.

## Task 6: Upload, Whisper, And Summary Nodes

**Files:**
- Create workflow Feign clients for file and AI.
- Create `UploadNodeExecutor`, `WhisperNodeExecutor`, `SummaryNodeExecutor`.
- Tests: `UploadNodeExecutorTest`, `WhisperNodeExecutorTest`, `SummaryNodeExecutorTest`

- [ ] **Step 1: Write failing Upload test**

```java
when(fileClient.getMetadata("token", 9L)).thenReturn(Result.success(metadata));
NodeResult result = executor.execute(contextWithConfig(Map.of("fileId", 9L)));
assertThat(result.variables()).containsEntry("fileUrl", metadata.getUrl());
```

- [ ] **Step 2: Write failing Whisper test**

```java
when(aiClient.execute(any())).thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
        "WHISPER", "SUCCEEDED", Map.of("text", "hello world"))));
NodeResult result = executor.execute(contextWithVariables(Map.of("fileUrl", "http://minio/audio.mp3")));
assertThat(result.variables()).containsEntry("transcription", "hello world");
```

- [ ] **Step 3: Write failing Summary test**

```java
when(aiClient.execute(any())).thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
        "SUMMARY", "SUCCEEDED", Map.of("summary", "short"))));
NodeResult result = executor.execute(contextWithVariables(Map.of("transcription", "long text")));
assertThat(result.variables()).containsEntry("summary", "short");
```

- [ ] **Step 4: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=UploadNodeExecutorTest,WhisperNodeExecutorTest,SummaryNodeExecutorTest test
```

Expected: compile failure.

- [ ] **Step 5: Implement clients and nodes**

Feign client endpoints:

```java
@GetMapping("/metadata/{fileId}")
Result<FileMetadataDTO> getMetadata(@RequestHeader(InternalHeaders.FILE_SERVICE_TOKEN) String token,
                                    @PathVariable Long fileId);

@PostMapping("/nodes/execute")
Result<AiWorkflowNodeResponseDTO> execute(@RequestBody AiWorkflowNodeRequestDTO request);
```

Node behavior:
- UPLOAD resolves `fileId`.
- WHISPER sends nodeType `WHISPER` and payload with `fileUrl`, `language`, `prompt`.
- SUMMARY sends nodeType `SUMMARY` and payload with `text`, `language`, `prompt`, `provider`, `model`.

- [ ] **Step 6: Run GREEN**

Run same command. Expected: PASS.

## Task 7: Export And Notify Nodes

**Files:**
- Modify: `backend/workflow-service/pom.xml`
- Modify: `backend/workflow-service/src/main/resources/application.yml`
- Create: `ExportNodeExecutor`, `NotifyNodeExecutor`, MinIO config, Notify client.
- Tests: `ExportNodeExecutorTest`, `NotifyNodeExecutorTest`, `WorkflowNodeConfigTest`

- [ ] **Step 1: Write failing Export test**

```java
NodeResult result = executor.execute(contextWithVariables(Map.of("summary", "Done")));
assertThat(result.output()).containsEntry("format", "MARKDOWN");
assertThat(result.variables()).containsKey("exportFile");
verify(fileClient).createMetadata(eq("token"), any(CreateFileMetadataRequestDTO.class));
```

- [ ] **Step 2: Write failing Notify test**

```java
NodeResult result = executor.execute(contextWithConfig(Map.of("userId", 7L, "eventType", "WORKFLOW_COMPLETED")));
verify(notifyClient).send(any(NotifyMessageDTO.class));
assertThat(result.output()).containsEntry("notified", true);
```

- [ ] **Step 3: Run RED**

Run:

```powershell
mvn -pl backend/workflow-service -am -Dtest=ExportNodeExecutorTest,NotifyNodeExecutorTest,WorkflowNodeConfigTest test
```

Expected: compile failure or missing dependency failure.

- [ ] **Step 4: Implement export/notify and config**

Add dependency:

```xml
<dependency>
    <groupId>io.minio</groupId>
    <artifactId>minio</artifactId>
</dependency>
```

Add config:

```yaml
aetherflow:
  minio:
    endpoint: ${MINIO_ENDPOINT:http://192.168.101.68:9000}
    public-endpoint: ${MINIO_PUBLIC_ENDPOINT:http://192.168.101.68:9000}
    access-key: ${MINIO_ACCESS_KEY:minioadmin}
    secret-key: ${MINIO_SECRET_KEY:minioadmin}
    bucket: ${MINIO_BUCKET:aetherflow}
  file:
    internal-token: ${FILE_INTERNAL_TOKEN:aetherflow-file-internal-dev-token}
  workflow:
    node:
      export-object-prefix: ${WORKFLOW_EXPORT_OBJECT_PREFIX:workflow/exports}
      default-summary-language: ${WORKFLOW_SUMMARY_LANGUAGE:English}
      default-whisper-language: ${WORKFLOW_WHISPER_LANGUAGE:auto}
```

- [ ] **Step 5: Run GREEN**

Run same command. Expected: PASS.

## Task 8: Full Verification And Handoff

**Files:**
- Modify: `AGENT.md`
- Modify: `docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md`
- Modify: `docs/agent/logs/2026-05-28.md`

- [ ] **Step 1: Run full module tests**

Run:

```powershell
$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test
```

Expected: BUILD SUCCESS.

- [ ] **Step 2: Run diff checks**

Run:

```powershell
git diff --check
git diff --name-only main...HEAD
```

Expected: no whitespace errors and only files inside the claim scope.

- [ ] **Step 3: Update task records**

Set task status to `REVIEW`, record validation evidence, and release file locks.

- [ ] **Step 4: Commit business changes**

Run:

```powershell
git add backend/common backend/file-service backend/ai-service backend/workflow-service docs/superpowers docs/agent AGENT.md
git commit -m "feat(workflow): add node executor ecosystem"
git push
```

Expected: feature branch pushed successfully.

## Self-Review

- Spec coverage: covers node architecture, runtime boundary, every required node executor, NodeResult usage, metrics API, application.yml, tests, and risks.
- Placeholder scan: no deferred placeholder markers.
- Type consistency: plan uses `AiWorkflowNodeRequestDTO`, `AiWorkflowNodeResponseDTO`, `WorkflowNodeMetricsSnapshot`, and `WorkflowNodeContextKeys` consistently.
