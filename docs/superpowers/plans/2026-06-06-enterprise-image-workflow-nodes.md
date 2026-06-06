# Enterprise Image Workflow Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production-grade image generation workflow nodes backed by Stable Diffusion WebUI and ComfyUI, with MinIO persistence, runtime writeback, ComfyUI workflow import, and frontend dynamic parameters.

**Architecture:** Keep workflow runtime unchanged. `ai-service` owns image provider protocols and returns generated image payloads; `workflow-service` owns workflow node execution, MinIO storage, file metadata registration, and runtime variables. The frontend consumes backend node catalog metadata for image node panels while preserving existing hard-coded panels for current nodes.

**Tech Stack:** Java 17, Spring Boot, Spring `RestClient`, Feign, MinIO Java SDK, MyBatis Plus, Vue 3, Pinia, TypeScript, Vite, Vitest-style script checks already used by this repo.

---

## Preconditions

This repository's `AGENT.md` requires a confirmed task boundary before business-code edits. Before executing implementation tasks, create and confirm:

- Task ID: `IMAGE-WORKFLOW-20260606`
- Branch: `feature/IMAGE-WORKFLOW-20260606-image-nodes`
- Allowed backend paths:
  - `backend/common/src/main/java/com/aetherflow/common/dto/**`
  - `backend/ai-service/src/main/java/com/aetherflow/ai/**`
  - `backend/ai-service/src/test/java/com/aetherflow/ai/**`
  - `backend/workflow-service/src/main/java/com/aetherflow/workflow/**`
  - `backend/workflow-service/src/test/java/com/aetherflow/workflow/**`
  - `backend/workflow-service/src/main/resources/application*.yml`
- Allowed frontend paths:
  - `frontend/src/types/workflow.ts`
  - `frontend/src/api/modules/node.ts`
  - `frontend/src/api/mappers/workflowMapper.ts`
  - `frontend/src/services/mock/workflowMock.ts`
  - `frontend/src/components/workflow/NodeInspector.vue`
  - `frontend/src/components/workflow/WorkflowNode.vue`
  - `frontend/src/components/workflow/NodeAddMenu.vue`
  - `frontend/src/components/workflow/NodePalette.vue`
  - `frontend/src/i18n/locales/*.ts`
  - `frontend/scripts/check-workflow-image-nodes.mjs`
- Allowed docs paths:
  - `docs/agent/tasks/IMAGE-WORKFLOW-20260606.md`
  - `docs/COMMON_CONTRACTS.md` only if catalog schema contract changes are documented
- Contract changes allowed:
  - Add DTOs for image workflow node payloads.
  - Extend workflow node catalog schema with optional UI metadata.
  - Add workflow-service import endpoint for ComfyUI workflow JSON.
- Database changes: not required.
- Runtime core changes: forbidden.

Recommended verification:

```powershell
git diff --check
mvn -pl backend/common,backend/ai-service,backend/workflow-service,backend/file-service -am test
Push-Location frontend; npm run build; node scripts/check-workflow-image-nodes.mjs; Pop-Location
```

---

## File Structure

### backend/common

- `ImageWorkflowDtos.java`: shared DTOs for image workflow execution payloads and generated images.
- `WorkflowNodeConfigUiSchema.java`: optional frontend rendering metadata for node catalog fields.
- `WorkflowNodeConfigSchema.java`: add optional `ui` metadata without breaking existing catalog clients.

### backend/ai-service

- `image/ImageGenerationProvider.java`: provider interface.
- `image/ImageGenerationRequest.java`: normalized image request model.
- `image/ImageGenerationResponse.java`: normalized provider result model.
- `image/GeneratedImagePayload.java`: generated image data, content type, file name, and metadata.
- `image/ImageProviderType.java`: provider enum.
- `image/StableDiffusionWebUiProvider.java`: SD WebUI adapter.
- `image/ComfyUiProvider.java`: ComfyUI queue/history adapter.
- `image/ImageProviderRegistry.java`: provider lookup.
- `workflow/executor/ImageGenerationAiNodeExecutor.java`: internal AI workflow node executor.
- `workflow/executor/UpscaleAiNodeExecutor.java`: upscale executor.
- `workflow/executor/PromptAiNodeExecutor.java`: prompt normalization executor.
- `config/ImageProviderProperties.java`: URLs, enable flags, timeouts, polling.

### backend/workflow-service

- `node/WorkflowNodeTypes.java`: add `PROMPT`, `IMAGE_GENERATION`, `UPSCALE`, `SAVE_IMAGE`.
- `node/executor/PromptNodeExecutor.java`: workflow prompt node.
- `node/executor/ImageGenerationNodeExecutor.java`: call ai-service, store images, write runtime variables.
- `node/executor/UpscaleNodeExecutor.java`: call ai-service upscale, store images, write variables.
- `node/executor/SaveImageNodeExecutor.java`: persist image payloads or references.
- `node/executor/ImageArtifactStorage.java`: focused MinIO and file-service registration helper.
- `node/catalog/WorkflowNodeCatalogService.java`: add image nodes and config schema.
- `comfy/ComfyWorkflowImportController.java`: import endpoint.
- `comfy/ComfyWorkflowImportService.java`: convert ComfyUI workflow JSON to `WorkflowDefinitionDTO`.

### frontend

- `types/workflow.ts`: add image node kinds and richer config value shape.
- `api/modules/node.ts`: read new catalog schema fields.
- `services/mock/workflowMock.ts`: image node templates.
- `api/mappers/workflowMapper.ts`: backend node type mapping and config normalization.
- `components/workflow/NodeInspector.vue`: image dynamic basic/advanced panel.
- `i18n/locales/*.ts`: labels and field names.
- `scripts/check-workflow-image-nodes.mjs`: targeted frontend regression check.

---

### Task 1: Create Task Boundary Document And Branch

**Files:**
- Create: `docs/agent/tasks/IMAGE-WORKFLOW-20260606.md`

- [ ] **Step 1: Create the task document**

Create `docs/agent/tasks/IMAGE-WORKFLOW-20260606.md` with:

```markdown
# IMAGE-WORKFLOW-20260606

任务ID：IMAGE-WORKFLOW-20260606
任务名称：企业级图像生成工作流节点体系
负责人：当前任务发起人
Agent ID：Codex
Session ID：当前会话
分支：feature/IMAGE-WORKFLOW-20260606-image-nodes
状态：IN_PROGRESS

任务目标：
新增 Stable Diffusion WebUI Provider、ComfyUI Provider、Prompt/ImageGeneration/Upscale/SaveImage 工作流节点、ComfyUI workflow.json 导入、前端基础/高级动态参数面板，并将生成图片自动存储 MinIO 后回写 Workflow Runtime。

允许修改文件：
1. backend/common/src/main/java/com/aetherflow/common/dto/**
2. backend/ai-service/src/main/java/com/aetherflow/ai/**
3. backend/ai-service/src/test/java/com/aetherflow/ai/**
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/**
5. backend/workflow-service/src/test/java/com/aetherflow/workflow/**
6. backend/workflow-service/src/main/resources/application*.yml
7. frontend/src/types/workflow.ts
8. frontend/src/api/modules/node.ts
9. frontend/src/api/mappers/workflowMapper.ts
10. frontend/src/services/mock/workflowMock.ts
11. frontend/src/components/workflow/NodeInspector.vue
12. frontend/src/components/workflow/WorkflowNode.vue
13. frontend/src/components/workflow/NodeAddMenu.vue
14. frontend/src/components/workflow/NodePalette.vue
15. frontend/src/i18n/locales/*.ts
16. frontend/scripts/check-workflow-image-nodes.mjs

禁止修改文件：
1. backend/workflow-runtime-api/**
2. backend/file-service/src/main/resources/db/**
3. backend/workflow-service/src/main/resources/db/**
4. 任何与本任务无关的已有改动

是否允许新增文件：是
允许新增的位置：
1. backend/common/src/main/java/com/aetherflow/common/dto/
2. backend/ai-service/src/main/java/com/aetherflow/ai/image/
3. backend/ai-service/src/test/java/com/aetherflow/ai/image/
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/comfy/
5. backend/workflow-service/src/test/java/com/aetherflow/workflow/comfy/
6. frontend/scripts/

是否允许修改接口：是，限内部 AI workflow node DTO、workflow node catalog schema、ComfyUI import API
是否允许修改数据库：否
是否允许修改配置：是，限 ai-service/workflow-service 图像节点配置

Agent 编码计划：
1. 建立共享 DTO 与 catalog UI schema。
2. 实现 ai-service 图像 Provider 抽象、SD WebUI Provider、ComfyUI Provider。
3. 实现 ai-service 图像 AI 节点执行器。
4. 实现 workflow-service 图像节点与 MinIO 存储回写。
5. 实现 ComfyUI workflow JSON import。
6. 实现前端图像节点模板、mapper、基础/高级动态参数面板。
7. 运行后端与前端验证。

不会修改：
1. workflow-runtime-api
2. runtime DAG 调度逻辑
3. 数据库 schema
4. 既有非图像节点行为

是否涉及契约变更：是
文件锁范围：以上允许修改文件
验证方式：
1. git diff --check
2. mvn -pl backend/common,backend/ai-service,backend/workflow-service,backend/file-service -am test
3. Push-Location frontend; npm run build; node scripts/check-workflow-image-nodes.mjs; Pop-Location
当前风险：
1. ComfyUI workflow JSON 版本差异，需要保留原始 workflowJson。
2. SDXL/Flux/LoRA/VAE 能力依赖外部运行时安装的模型。
3. 当前工作树已有无关改动，执行时必须只暂存本任务文件。
```

- [ ] **Step 2: Create the feature branch**

Run:

```powershell
git switch -c feature/IMAGE-WORKFLOW-20260606-image-nodes
```

Expected: branch switches to `feature/IMAGE-WORKFLOW-20260606-image-nodes`.

- [ ] **Step 3: Commit task document**

Run:

```powershell
git add -- docs/agent/tasks/IMAGE-WORKFLOW-20260606.md
git commit -m "docs: claim image workflow node task"
```

Expected: one commit containing only the task document.

---

### Task 2: Add Shared Image DTOs And Catalog UI Metadata

**Files:**
- Create: `backend/common/src/main/java/com/aetherflow/common/dto/ImageWorkflowDtos.java`
- Create: `backend/common/src/main/java/com/aetherflow/common/dto/WorkflowNodeConfigUiSchema.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeConfigSchema.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java`

- [ ] **Step 1: Write failing catalog schema test**

Add assertions to `WorkflowNodeCatalogControllerTest`:

```java
WorkflowNodeCatalogItem image = item(result.getData(), "IMAGE_GENERATION");
assertThat(image.configSchema())
        .extracting(WorkflowNodeConfigSchema::name)
        .contains("prompt", "negativePrompt", "seed", "steps", "cfgScale", "sampler", "scheduler",
                "width", "height", "batchSize", "denoiseStrength", "checkpoint", "vae", "lora");
assertThat(image.configSchema().stream()
        .filter(field -> "prompt".equals(field.name()))
        .findFirst()
        .orElseThrow()
        .ui()
        .mode()).isEqualTo("basic");
assertThat(image.configSchema().stream()
        .filter(field -> "lora".equals(field.name()))
        .findFirst()
        .orElseThrow()
        .ui()
        .mode()).isEqualTo("advanced");
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=WorkflowNodeCatalogControllerTest test
```

Expected: FAIL because `IMAGE_GENERATION` is not in catalog and `WorkflowNodeConfigSchema.ui()` does not exist.

- [ ] **Step 3: Add DTOs**

Create `ImageWorkflowDtos.java`:

```java
package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

public final class ImageWorkflowDtos {

    private ImageWorkflowDtos() {
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "Generated image payload returned by ai-service to workflow-service.")
    public static class GeneratedImage {
        private String fileName;
        private String contentType;
        private String base64Data;
        private Long size;
        private Map<String, Object> metadata;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "Normalized image workflow node response.")
    public static class ImageNodeOutput {
        private String provider;
        private String mode;
        private List<GeneratedImage> images;
        private Map<String, Object> metadata;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "LoRA model reference for image generation.")
    public static class LoraConfig {
        private String name;
        private Double weight;
    }
}
```

Create `WorkflowNodeConfigUiSchema.java`:

```java
package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Optional frontend UI metadata for workflow node config fields.")
public record WorkflowNodeConfigUiSchema(
        @Schema(description = "Inspector mode where this field is shown.", example = "basic")
        String mode,

        @Schema(description = "Frontend control type.", example = "textarea")
        String control,

        @Schema(description = "Minimum numeric value.", example = "1")
        Number min,

        @Schema(description = "Maximum numeric value.", example = "4096")
        Number max,

        @Schema(description = "Numeric step.", example = "1")
        Number step
) {
    public static WorkflowNodeConfigUiSchema basic(String control) {
        return new WorkflowNodeConfigUiSchema("basic", control, null, null, null);
    }

    public static WorkflowNodeConfigUiSchema basicNumber(Number min, Number max, Number step) {
        return new WorkflowNodeConfigUiSchema("basic", "number", min, max, step);
    }

    public static WorkflowNodeConfigUiSchema advanced(String control) {
        return new WorkflowNodeConfigUiSchema("advanced", control, null, null, null);
    }

    public static WorkflowNodeConfigUiSchema advancedNumber(Number min, Number max, Number step) {
        return new WorkflowNodeConfigUiSchema("advanced", "number", min, max, step);
    }
}
```

- [ ] **Step 4: Extend catalog schema record**

Modify `WorkflowNodeConfigSchema.java` to add the `ui` component:

```java
package com.aetherflow.workflow.node.catalog;

import com.aetherflow.common.dto.WorkflowNodeConfigUiSchema;
import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Workflow node config field schema for frontend form rendering.")
public record WorkflowNodeConfigSchema(
        @Schema(description = "Config key.", example = "fileIdVariable")
        String name,

        @Schema(description = "Frontend input type.", example = "STRING")
        String type,

        @Schema(description = "Whether the field must be provided.", example = "false")
        boolean required,

        @Schema(description = "Human readable field description.",
                example = "Workflow variable name that contains the uploaded file id.")
        String description,

        @Schema(description = "Example field value.", example = "fileId")
        Object example,

        @Schema(description = "Allowed values for enum-like fields.", example = "[\"MARKDOWN\",\"TXT\",\"JSON\"]")
        List<String> options,

        @Schema(description = "Optional UI rendering metadata for frontend dynamic forms.")
        WorkflowNodeConfigUiSchema ui
) {
}
```

- [ ] **Step 5: Update catalog helper overloads**

In `WorkflowNodeCatalogService`, add overloads so existing fields compile:

```java
private WorkflowNodeConfigSchema field(String name, String type, boolean required, String description, Object example) {
    return field(name, type, required, description, example, List.of(), null);
}

private WorkflowNodeConfigSchema field(String name, String type, boolean required, String description, Object example, List<String> options) {
    return field(name, type, required, description, example, options, null);
}

private WorkflowNodeConfigSchema field(String name,
                                       String type,
                                       boolean required,
                                       String description,
                                       Object example,
                                       List<String> options,
                                       WorkflowNodeConfigUiSchema ui) {
    return new WorkflowNodeConfigSchema(name, type, required, description, example,
            options == null ? List.of() : List.copyOf(options), ui);
}
```

- [ ] **Step 6: Run test to verify DTO/schema task passes**

Run:

```powershell
mvn -pl backend/common,backend/workflow-service -Dtest=WorkflowNodeCatalogControllerTest test
```

Expected: the test still fails only because image catalog entries are not implemented. Compilation should pass for the new schema.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- backend/common/src/main/java/com/aetherflow/common/dto/ImageWorkflowDtos.java backend/common/src/main/java/com/aetherflow/common/dto/WorkflowNodeConfigUiSchema.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeConfigSchema.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java
git commit -m "feat(workflow): extend node config schema for image nodes"
```

---

### Task 3: Implement ai-service Image Provider Abstractions

**Files:**
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageProviderType.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageGenerationRequest.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/GeneratedImagePayload.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageGenerationResponse.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageGenerationProvider.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageProviderRegistry.java`
- Test: `backend/ai-service/src/test/java/com/aetherflow/ai/image/ImageProviderRegistryTest.java`

- [ ] **Step 1: Write provider registry test**

Create `ImageProviderRegistryTest.java`:

```java
package com.aetherflow.ai.image;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImageProviderRegistryTest {

    @Test
    void returnsProviderByType() {
        ImageGenerationProvider provider = new StubProvider(ImageProviderType.COMFYUI);
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(provider));

        assertThat(registry.getRequired("comfyui")).isSameAs(provider);
    }

    @Test
    void rejectsUnsupportedProvider() {
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of());

        assertThatThrownBy(() -> registry.getRequired("missing"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported image provider");
    }

    private record StubProvider(ImageProviderType type) implements ImageGenerationProvider {
        @Override
        public ImageGenerationResponse generate(ImageGenerationRequest request) {
            return new ImageGenerationResponse(type.name(), request.mode(), List.of(), Map.of());
        }
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ImageProviderRegistryTest test
```

Expected: FAIL because image provider classes do not exist.

- [ ] **Step 3: Add image provider model classes**

Create the model classes:

```java
package com.aetherflow.ai.image;

import java.util.Locale;

public enum ImageProviderType {
    STABLE_DIFFUSION_WEBUI,
    COMFYUI;

    public static ImageProviderType from(String value, ImageProviderType fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return ImageProviderType.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
```

```java
package com.aetherflow.ai.image;

import java.time.Duration;
import java.util.List;
import java.util.Map;

public record ImageGenerationRequest(
        ImageProviderType provider,
        String mode,
        String prompt,
        String negativePrompt,
        Long seed,
        Integer steps,
        Double cfgScale,
        String sampler,
        String scheduler,
        Integer width,
        Integer height,
        Integer batchSize,
        Double denoiseStrength,
        String checkpoint,
        String vae,
        List<Map<String, Object>> lora,
        String sourceImageBase64,
        String sourceImageContentType,
        Map<String, Object> workflowJson,
        Map<String, Object> options,
        Duration timeout
) {
    public ImageGenerationRequest {
        mode = mode == null || mode.isBlank() ? "txt2img" : mode;
        lora = lora == null ? List.of() : List.copyOf(lora);
        options = options == null ? Map.of() : Map.copyOf(options);
        workflowJson = workflowJson == null ? Map.of() : Map.copyOf(workflowJson);
    }
}
```

```java
package com.aetherflow.ai.image;

import java.util.Map;

public record GeneratedImagePayload(
        String fileName,
        String contentType,
        String base64Data,
        Long size,
        Map<String, Object> metadata
) {
    public GeneratedImagePayload {
        contentType = contentType == null || contentType.isBlank() ? "image/png" : contentType;
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
```

```java
package com.aetherflow.ai.image;

import java.util.List;
import java.util.Map;

public record ImageGenerationResponse(
        String provider,
        String mode,
        List<GeneratedImagePayload> images,
        Map<String, Object> metadata
) {
    public ImageGenerationResponse {
        images = images == null ? List.of() : List.copyOf(images);
        metadata = metadata == null ? Map.of() : Map.copyOf(metadata);
    }
}
```

```java
package com.aetherflow.ai.image;

public interface ImageGenerationProvider {

    ImageProviderType type();

    ImageGenerationResponse generate(ImageGenerationRequest request);

    default ImageGenerationResponse upscale(ImageGenerationRequest request) {
        return generate(request);
    }
}
```

```java
package com.aetherflow.ai.image;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class ImageProviderRegistry {

    private final Map<ImageProviderType, ImageGenerationProvider> providers;

    public ImageProviderRegistry(List<ImageGenerationProvider> providers) {
        this.providers = providers.stream()
                .collect(Collectors.toUnmodifiableMap(ImageGenerationProvider::type, Function.identity()));
    }

    public ImageGenerationProvider getRequired(String provider) {
        ImageProviderType type = parse(provider);
        ImageGenerationProvider imageProvider = providers.get(type);
        if (imageProvider == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported image provider: " + provider);
        }
        return imageProvider;
    }

    private ImageProviderType parse(String provider) {
        String normalized = provider == null ? "" : provider.trim().toUpperCase(Locale.ROOT);
        if ("SD_WEBUI".equals(normalized) || "STABLE_DIFFUSION".equals(normalized)) {
            return ImageProviderType.STABLE_DIFFUSION_WEBUI;
        }
        return ImageProviderType.from(normalized, ImageProviderType.COMFYUI);
    }
}
```

- [ ] **Step 4: Run registry test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ImageProviderRegistryTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- backend/ai-service/src/main/java/com/aetherflow/ai/image backend/ai-service/src/test/java/com/aetherflow/ai/image/ImageProviderRegistryTest.java
git commit -m "feat(ai): add image provider abstraction"
```

---

### Task 4: Implement Stable Diffusion WebUI Provider

**Files:**
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/config/ImageProviderProperties.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/StableDiffusionWebUiProvider.java`
- Test: `backend/ai-service/src/test/java/com/aetherflow/ai/image/StableDiffusionWebUiProviderTest.java`

- [ ] **Step 1: Write request mapping tests**

Create `StableDiffusionWebUiProviderTest.java` with `MockRestServiceServer`:

```java
package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class StableDiffusionWebUiProviderTest {

    @Test
    void mapsTxt2ImgRequest() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://sd");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        StableDiffusionWebUiProvider provider = new StableDiffusionWebUiProvider(builder.build(), properties());

        server.expect(requestTo("http://sd/sdapi/v1/txt2img"))
                .andExpect(jsonPath("$.prompt").value("cat <lora:detail:0.8>"))
                .andExpect(jsonPath("$.negative_prompt").value("blur"))
                .andExpect(jsonPath("$.steps").value(25))
                .andExpect(jsonPath("$.cfg_scale").value(7.5))
                .andExpect(jsonPath("$.width").value(1024))
                .andExpect(jsonPath("$.height").value(768))
                .andRespond(withSuccess("""
                        {"images":["aW1hZ2UtYnl0ZXM="],"parameters":{"seed":123},"info":"{}"}
                        """, MediaType.APPLICATION_JSON));

        ImageGenerationResponse response = provider.generate(new ImageGenerationRequest(
                ImageProviderType.STABLE_DIFFUSION_WEBUI,
                "txt2img",
                "cat",
                "blur",
                123L,
                25,
                7.5,
                "Euler a",
                "normal",
                1024,
                768,
                1,
                0.6,
                "sdxl.safetensors",
                "vae-ft-mse",
                List.of(Map.of("name", "detail", "weight", 0.8)),
                null,
                null,
                Map.of(),
                Map.of(),
                Duration.ofSeconds(30)
        ));

        assertThat(response.provider()).isEqualTo("STABLE_DIFFUSION_WEBUI");
        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).contentType()).isEqualTo("image/png");
        assertThat(response.images().get(0).base64Data()).isEqualTo("aW1hZ2UtYnl0ZXM=");
        server.verify();
    }

    private ImageProviderProperties properties() {
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getStableDiffusion().setEnabled(true);
        properties.getStableDiffusion().setBaseUrl("http://sd");
        return properties;
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=StableDiffusionWebUiProviderTest test
```

Expected: FAIL because provider and properties do not exist.

- [ ] **Step 3: Add provider properties**

Create `ImageProviderProperties.java`:

```java
package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Data
@Component
@ConfigurationProperties(prefix = "aetherflow.ai.image")
public class ImageProviderProperties {

    private StableDiffusion stableDiffusion = new StableDiffusion();
    private Comfy comfy = new Comfy();
    private Duration defaultTimeout = Duration.ofMinutes(5);

    @Data
    public static class StableDiffusion {
        private boolean enabled = false;
        private String baseUrl = "http://127.0.0.1:7860";
    }

    @Data
    public static class Comfy {
        private boolean enabled = false;
        private String baseUrl = "http://127.0.0.1:8188";
        private Duration pollInterval = Duration.ofSeconds(1);
        private Duration maxWait = Duration.ofMinutes(10);
    }
}
```

- [ ] **Step 4: Implement provider**

Create `StableDiffusionWebUiProvider.java`:

```java
package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
@ConditionalOnProperty(prefix = "aetherflow.ai.image.stable-diffusion", name = "enabled", havingValue = "true")
public class StableDiffusionWebUiProvider implements ImageGenerationProvider {

    private final RestClient restClient;
    private final ImageProviderProperties properties;

    public StableDiffusionWebUiProvider(RestClient.Builder builder, ImageProviderProperties properties) {
        this(builder.baseUrl(properties.getStableDiffusion().getBaseUrl()).build(), properties);
    }

    StableDiffusionWebUiProvider(RestClient restClient, ImageProviderProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public ImageProviderType type() {
        return ImageProviderType.STABLE_DIFFUSION_WEBUI;
    }

    @Override
    public ImageGenerationResponse generate(ImageGenerationRequest request) {
        String mode = request.mode().toLowerCase(Locale.ROOT);
        String endpoint = "img2img".equals(mode) ? "/sdapi/v1/img2img" : "/sdapi/v1/txt2img";
        SdWebUiResponse response = restClient.post()
                .uri(endpoint)
                .body(toPayload(request, "img2img".equals(mode)))
                .retrieve()
                .body(SdWebUiResponse.class);
        if (response == null || response.images() == null || response.images().isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "stable diffusion webui returned no images");
        }
        List<GeneratedImagePayload> images = new ArrayList<>();
        for (int index = 0; index < response.images().size(); index++) {
            images.add(new GeneratedImagePayload(
                    "sd-webui-" + (index + 1) + ".png",
                    "image/png",
                    response.images().get(index),
                    null,
                    Map.of("index", index)
            ));
        }
        return new ImageGenerationResponse(type().name(), request.mode(), images,
                Map.of("parameters", response.parameters() == null ? Map.of() : response.parameters(),
                        "info", response.info() == null ? "" : response.info()));
    }

    private Map<String, Object> toPayload(ImageGenerationRequest request, boolean img2img) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", promptWithLora(request.prompt(), request.lora()));
        payload.put("negative_prompt", request.negativePrompt() == null ? "" : request.negativePrompt());
        put(payload, "seed", request.seed());
        put(payload, "steps", request.steps());
        put(payload, "cfg_scale", request.cfgScale());
        put(payload, "sampler_name", request.sampler());
        put(payload, "scheduler", request.scheduler());
        put(payload, "width", request.width());
        put(payload, "height", request.height());
        put(payload, "batch_size", request.batchSize());
        put(payload, "denoising_strength", request.denoiseStrength());
        if (img2img) {
            if (request.sourceImageBase64() == null || request.sourceImageBase64().isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "img2img source image is required");
            }
            payload.put("init_images", List.of(request.sourceImageBase64()));
        }
        if (request.options() != null) {
            payload.putAll(request.options());
        }
        return payload;
    }

    private String promptWithLora(String prompt, List<Map<String, Object>> loras) {
        StringBuilder builder = new StringBuilder(prompt == null ? "" : prompt);
        for (Map<String, Object> lora : loras) {
            String name = String.valueOf(lora.getOrDefault("name", "")).trim();
            if (name.isBlank()) {
                continue;
            }
            Object weight = lora.getOrDefault("weight", 1.0D);
            builder.append(" <lora:").append(name).append(":").append(weight).append(">");
        }
        return builder.toString().trim();
    }

    private void put(Map<String, Object> payload, String key, Object value) {
        if (value != null) {
            payload.put(key, value);
        }
    }

    record SdWebUiResponse(List<String> images, Map<String, Object> parameters, String info) {
    }
}
```

- [ ] **Step 5: Run test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=StableDiffusionWebUiProviderTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- backend/ai-service/src/main/java/com/aetherflow/ai/config/ImageProviderProperties.java backend/ai-service/src/main/java/com/aetherflow/ai/image/StableDiffusionWebUiProvider.java backend/ai-service/src/test/java/com/aetherflow/ai/image/StableDiffusionWebUiProviderTest.java
git commit -m "feat(ai): add stable diffusion webui image provider"
```

---

### Task 5: Implement ComfyUI Provider

**Files:**
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/image/ComfyUiProvider.java`
- Test: `backend/ai-service/src/test/java/com/aetherflow/ai/image/ComfyUiProviderTest.java`

- [ ] **Step 1: Write queue/history test**

Create `ComfyUiProviderTest.java`:

```java
package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ComfyUiProviderTest {

    @Test
    void queuesWorkflowAndReadsHistoryImages() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://comfy");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        ImageProviderProperties properties = new ImageProviderProperties();
        properties.getComfy().setEnabled(true);
        properties.getComfy().setBaseUrl("http://comfy");
        properties.getComfy().setPollInterval(Duration.ZERO);
        properties.getComfy().setMaxWait(Duration.ofSeconds(1));
        ComfyUiProvider provider = new ComfyUiProvider(builder.build(), properties);

        server.expect(requestTo("http://comfy/prompt"))
                .andRespond(withSuccess("{\"prompt_id\":\"abc\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/history/abc"))
                .andRespond(withSuccess("""
                        {"abc":{"outputs":{"9":{"images":[{"filename":"out.png","subfolder":"","type":"output"}]}}}}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://comfy/view?filename=out.png&subfolder=&type=output"))
                .andRespond(withSuccess("image-bytes", MediaType.IMAGE_PNG));

        ImageGenerationResponse response = provider.generate(new ImageGenerationRequest(
                ImageProviderType.COMFYUI,
                "workflow",
                "cat",
                "",
                1L,
                20,
                7.0,
                "euler",
                "normal",
                512,
                512,
                1,
                0.5,
                "model.safetensors",
                "",
                null,
                null,
                null,
                Map.of("1", Map.of("class_type", "KSampler")),
                Map.of(),
                Duration.ofSeconds(1)
        ));

        assertThat(response.provider()).isEqualTo("COMFYUI");
        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).fileName()).isEqualTo("out.png");
        assertThat(response.images().get(0).base64Data()).isEqualTo("aW1hZ2UtYnl0ZXM=");
        server.verify();
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ComfyUiProviderTest test
```

Expected: FAIL because `ComfyUiProvider` does not exist.

- [ ] **Step 3: Implement ComfyUI provider**

Create `ComfyUiProvider.java`:

```java
package com.aetherflow.ai.image;

import com.aetherflow.ai.config.ImageProviderProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.Base64Utils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(prefix = "aetherflow.ai.image.comfy", name = "enabled", havingValue = "true")
public class ComfyUiProvider implements ImageGenerationProvider {

    private final RestClient restClient;
    private final ImageProviderProperties properties;

    public ComfyUiProvider(RestClient.Builder builder, ImageProviderProperties properties) {
        this(builder.baseUrl(properties.getComfy().getBaseUrl()).build(), properties);
    }

    ComfyUiProvider(RestClient restClient, ImageProviderProperties properties) {
        this.restClient = restClient;
        this.properties = properties;
    }

    @Override
    public ImageProviderType type() {
        return ImageProviderType.COMFYUI;
    }

    @Override
    public ImageGenerationResponse generate(ImageGenerationRequest request) {
        Map<String, Object> promptPayload = Map.of("prompt", workflow(request));
        QueueResponse queue = restClient.post()
                .uri("/prompt")
                .body(promptPayload)
                .retrieve()
                .body(QueueResponse.class);
        if (queue == null || queue.prompt_id() == null || queue.prompt_id().isBlank()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui queue returned no prompt id");
        }
        Map<String, Object> history = waitForHistory(queue.prompt_id(), timeout(request));
        List<ComfyImageRef> refs = imageRefs(queue.prompt_id(), history);
        List<GeneratedImagePayload> images = refs.stream().map(this::download).toList();
        return new ImageGenerationResponse(type().name(), request.mode(), images,
                Map.of("promptId", queue.prompt_id(), "imageCount", images.size()));
    }

    private Map<String, Object> workflow(ImageGenerationRequest request) {
        if (!request.workflowJson().isEmpty()) {
            return request.workflowJson();
        }
        Map<String, Object> workflow = new LinkedHashMap<>();
        workflow.put("1", Map.of(
                "class_type", "AetherFlowPrompt",
                "inputs", Map.of(
                        "prompt", request.prompt() == null ? "" : request.prompt(),
                        "negative_prompt", request.negativePrompt() == null ? "" : request.negativePrompt(),
                        "width", request.width() == null ? 512 : request.width(),
                        "height", request.height() == null ? 512 : request.height()
                )));
        return workflow;
    }

    private Map<String, Object> waitForHistory(String promptId, Duration timeout) {
        Instant deadline = Instant.now().plus(timeout);
        while (!Instant.now().isAfter(deadline)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> history = restClient.get()
                    .uri("/history/{promptId}", promptId)
                    .retrieve()
                    .body(Map.class);
            if (history != null && history.containsKey(promptId)) {
                return history;
            }
            sleep(properties.getComfy().getPollInterval());
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui generation timed out");
    }

    private Duration timeout(ImageGenerationRequest request) {
        if (request.timeout() != null && !request.timeout().isNegative() && !request.timeout().isZero()) {
            return request.timeout();
        }
        return properties.getComfy().getMaxWait();
    }

    private void sleep(Duration duration) {
        if (duration == null || duration.isZero() || duration.isNegative()) {
            return;
        }
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "comfyui polling interrupted");
        }
    }

    @SuppressWarnings("unchecked")
    private List<ComfyImageRef> imageRefs(String promptId, Map<String, Object> history) {
        Object promptHistory = history.get(promptId);
        if (!(promptHistory instanceof Map<?, ?> promptMap)) {
            return List.of();
        }
        Object outputs = promptMap.get("outputs");
        if (!(outputs instanceof Map<?, ?> outputMap)) {
            return List.of();
        }
        List<ComfyImageRef> refs = new ArrayList<>();
        for (Object output : outputMap.values()) {
            if (!(output instanceof Map<?, ?> nodeOutput)) {
                continue;
            }
            Object images = nodeOutput.get("images");
            if (!(images instanceof Iterable<?> iterable)) {
                continue;
            }
            for (Object image : iterable) {
                if (image instanceof Map<?, ?> imageMap) {
                    refs.add(new ComfyImageRef(
                            String.valueOf(imageMap.getOrDefault("filename", "comfy-output.png")),
                            String.valueOf(imageMap.getOrDefault("subfolder", "")),
                            String.valueOf(imageMap.getOrDefault("type", "output"))
                    ));
                }
            }
        }
        return refs;
    }

    private GeneratedImagePayload download(ComfyImageRef ref) {
        URI uri = UriComponentsBuilder.fromPath("/view")
                .queryParam("filename", ref.filename())
                .queryParam("subfolder", ref.subfolder())
                .queryParam("type", ref.type())
                .build()
                .toUri();
        ResponseEntity<byte[]> response = restClient.get()
                .uri(uri)
                .retrieve()
                .toEntity(byte[].class);
        byte[] bytes = response.getBody() == null ? new byte[0] : response.getBody();
        String contentType = response.getHeaders().getContentType() == null
                ? "image/png"
                : response.getHeaders().getContentType().toString();
        return new GeneratedImagePayload(ref.filename(), contentType,
                Base64Utils.encodeToString(bytes), (long) bytes.length,
                Map.of("subfolder", ref.subfolder(), "type", ref.type()));
    }

    record QueueResponse(String prompt_id) {
    }

    record ComfyImageRef(String filename, String subfolder, String type) {
    }
}
```

- [ ] **Step 4: Run test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ComfyUiProviderTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- backend/ai-service/src/main/java/com/aetherflow/ai/image/ComfyUiProvider.java backend/ai-service/src/test/java/com/aetherflow/ai/image/ComfyUiProviderTest.java
git commit -m "feat(ai): add comfyui image provider"
```

---

### Task 6: Add ai-service Image Workflow Node Executors

**Files:**
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/ImageGenerationAiNodeExecutor.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/UpscaleAiNodeExecutor.java`
- Create: `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/PromptAiNodeExecutor.java`
- Test: `backend/ai-service/src/test/java/com/aetherflow/ai/workflow/ImageWorkflowNodeExecutorTest.java`

- [ ] **Step 1: Write executor test**

Create a test that registers a stub provider and verifies AI node output:

```java
package com.aetherflow.ai.workflow;

import com.aetherflow.ai.image.GeneratedImagePayload;
import com.aetherflow.ai.image.ImageGenerationProvider;
import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.executor.ImageGenerationAiNodeExecutor;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ImageWorkflowNodeExecutorTest {

    @Test
    void imageGenerationExecutorReturnsImagesInOutput() {
        ImageProviderRegistry registry = new ImageProviderRegistry(List.of(new StubProvider()));
        ImageGenerationAiNodeExecutor executor = new ImageGenerationAiNodeExecutor(registry);

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(null, Map.of(
                "provider", "COMFYUI",
                "mode", "txt2img",
                "prompt", "cat",
                "negativePrompt", "blur",
                "steps", 20,
                "width", 512,
                "height", 512
        )));

        assertThat(result.nodeType()).isEqualTo("IMAGE_GENERATION");
        assertThat(result.status()).isEqualTo("SUCCEEDED");
        assertThat(result.output()).containsKeys("provider", "mode", "images", "metadata");
    }

    private static final class StubProvider implements ImageGenerationProvider {
        @Override
        public ImageProviderType type() {
            return ImageProviderType.COMFYUI;
        }

        @Override
        public ImageGenerationResponse generate(ImageGenerationRequest request) {
            return new ImageGenerationResponse(type().name(), request.mode(),
                    List.of(new GeneratedImagePayload("image.png", "image/png", "aW1hZ2U=", 5L, Map.of())),
                    Map.of("seed", request.seed() == null ? -1 : request.seed()));
        }
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ImageWorkflowNodeExecutorTest test
```

Expected: FAIL because executors do not exist.

- [ ] **Step 3: Implement executors**

Create `ImageGenerationAiNodeExecutor.java`:

```java
package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.image.ImageProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ImageGenerationAiNodeExecutor implements AiNodeExecutor {

    private final ImageProviderRegistry providerRegistry;

    public ImageGenerationAiNodeExecutor(ImageProviderRegistry providerRegistry) {
        this.providerRegistry = providerRegistry;
    }

    @Override
    public String nodeType() {
        return "IMAGE_GENERATION";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        ImageGenerationRequest request = request(context.payload());
        ImageGenerationResponse response = providerRegistry.getRequired(request.provider().name()).generate(request);
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("provider", response.provider());
        output.put("mode", response.mode());
        output.put("images", response.images());
        output.put("metadata", response.metadata());
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }

    protected ImageGenerationRequest request(Map<String, Object> payload) {
        ImageProviderType provider = ImageProviderType.from(string(payload, "provider", "COMFYUI"), ImageProviderType.COMFYUI);
        return new ImageGenerationRequest(
                provider,
                string(payload, "mode", "txt2img"),
                string(payload, "prompt", ""),
                string(payload, "negativePrompt", ""),
                longValue(payload.get("seed")),
                intValue(payload.get("steps")),
                doubleValue(payload.get("cfgScale")),
                string(payload, "sampler", ""),
                string(payload, "scheduler", ""),
                intValue(payload.get("width")),
                intValue(payload.get("height")),
                intValue(payload.get("batchSize")),
                doubleValue(payload.get("denoiseStrength")),
                string(payload, "checkpoint", ""),
                string(payload, "vae", ""),
                listOfMaps(payload.get("lora")),
                string(payload, "sourceImageBase64", ""),
                string(payload, "sourceImageContentType", ""),
                map(payload.get("workflowJson")),
                map(payload.get("options")),
                Duration.ofSeconds(Math.max(1, intOr(payload.get("timeoutSeconds"), 300)))
        );
    }

    private String string(Map<String, Object> payload, String key, String fallback) {
        Object value = payload.get(key);
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value);
    }

    private Integer intValue(Object value) {
        Integer parsed = intOrNull(value);
        return parsed == null || parsed <= 0 ? null : parsed;
    }

    private int intOr(Object value, int fallback) {
        Integer parsed = intOrNull(value);
        return parsed == null ? fallback : parsed;
    }

    private Integer intOrNull(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private Double doubleValue(Object value) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> source ? new LinkedHashMap<>((Map<String, Object>) source) : Map.of();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> listOfMaps(Object value) {
        return value instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }
}
```

Create `UpscaleAiNodeExecutor.java`:

```java
package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class UpscaleAiNodeExecutor extends ImageGenerationAiNodeExecutor {

    private final ImageProviderRegistry providerRegistry;

    public UpscaleAiNodeExecutor(ImageProviderRegistry providerRegistry) {
        super(providerRegistry);
        this.providerRegistry = providerRegistry;
    }

    @Override
    public String nodeType() {
        return "UPSCALE";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        ImageGenerationRequest request = request(context.payload());
        ImageGenerationResponse response = providerRegistry.getRequired(request.provider().name()).upscale(request);
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("provider", response.provider());
        output.put("mode", "upscale");
        output.put("images", response.images());
        output.put("metadata", response.metadata());
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }
}
```

Create `PromptAiNodeExecutor.java`:

```java
package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class PromptAiNodeExecutor implements AiNodeExecutor {

    @Override
    public String nodeType() {
        return "PROMPT";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("prompt", context.payloadString("prompt", ""));
        output.put("negativePrompt", context.payloadString("negativePrompt", ""));
        output.put("metadata", Map.of("source", "PROMPT"));
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }
}
```

- [ ] **Step 4: Run executor test**

Run:

```powershell
mvn -pl backend/ai-service -Dtest=ImageWorkflowNodeExecutorTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/ImageGenerationAiNodeExecutor.java backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/UpscaleAiNodeExecutor.java backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/PromptAiNodeExecutor.java backend/ai-service/src/test/java/com/aetherflow/ai/workflow/ImageWorkflowNodeExecutorTest.java
git commit -m "feat(ai): add image workflow node executors"
```

---

### Task 7: Add workflow-service Image Artifact Storage

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ImageArtifactStorage.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/ImageArtifactStorageTest.java`

- [ ] **Step 1: Write storage helper test**

Create a Mockito test:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.config.WorkflowNodeConfig;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ImageArtifactStorageTest {

    @Test
    void storesImageAndRegistersMetadata() throws Exception {
        MinioClient minioClient = mock(MinioClient.class);
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        WorkflowNodeProperties nodeProperties = new WorkflowNodeProperties();
        nodeProperties.setFileInternalToken("token");
        nodeProperties.setExportObjectPrefix("workflow/exports");
        WorkflowNodeConfig.MinioProperties minio = new WorkflowNodeConfig.MinioProperties();
        minio.setBucket("aetherflow");
        ImageArtifactStorage storage = new ImageArtifactStorage(minioClient, fileClient, nodeProperties, minio);

        when(fileClient.createMetadata(eq("token"), any(CreateFileMetadataRequestDTO.class)))
                .thenReturn(Result.success(new FileMetadataDTO(7L, "aetherflow", "workflow/images/wf/node/image.png",
                        "image.png", "image/png", 5L, "http://minio/image.png")));

        FileMetadataDTO metadata = storage.store("wf", "node", 100L,
                new ImageWorkflowDtos.GeneratedImage("image.png", "image/png", "aW1hZ2U=", 5L, Map.of()));

        assertThat(metadata.getId()).isEqualTo(7L);
        verify(minioClient).putObject(any(PutObjectArgs.class));
        ArgumentCaptor<CreateFileMetadataRequestDTO> captor = ArgumentCaptor.forClass(CreateFileMetadataRequestDTO.class);
        verify(fileClient).createMetadata(eq("token"), captor.capture());
        assertThat(captor.getValue().getContentType()).isEqualTo("image/png");
        assertThat(captor.getValue().getUserId()).isEqualTo(100L);
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ImageArtifactStorageTest test
```

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Implement storage helper**

Create `ImageArtifactStorage.java`:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.config.WorkflowNodeConfig;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.stereotype.Component;
import org.springframework.util.Base64Utils;

import java.io.ByteArrayInputStream;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

@Component
public class ImageArtifactStorage {

    private final MinioClient minioClient;
    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties properties;
    private final WorkflowNodeConfig.MinioProperties minioProperties;

    public ImageArtifactStorage(MinioClient minioClient,
                                FileMetadataClient fileClient,
                                WorkflowNodeProperties properties,
                                WorkflowNodeConfig.MinioProperties minioProperties) {
        this.minioClient = minioClient;
        this.fileClient = fileClient;
        this.properties = properties;
        this.minioProperties = minioProperties;
    }

    public FileMetadataDTO store(String workflowId,
                                 String nodeId,
                                 Long userId,
                                 ImageWorkflowDtos.GeneratedImage image) {
        byte[] bytes = decode(image.getBase64Data());
        String fileName = sanitize(image.getFileName() == null ? "image.png" : image.getFileName());
        String objectKey = objectKey(workflowId, nodeId, fileName);
        upload(objectKey, contentType(image), bytes);
        return createMetadata(userId, objectKey, fileName, contentType(image), bytes.length);
    }

    private byte[] decode(String base64) {
        if (base64 == null || base64.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated image data is empty");
        }
        return Base64Utils.decodeFromString(base64);
    }

    private void upload(String objectKey, String contentType, byte[] bytes) {
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectKey)
                    .stream(inputStream, bytes.length, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow image upload failed");
        }
    }

    private FileMetadataDTO createMetadata(Long userId, String objectKey, String fileName, String contentType, long size) {
        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket(minioProperties.getBucket());
        request.setObjectKey(objectKey);
        request.setOriginalName(fileName);
        request.setContentType(contentType);
        request.setSize(size);
        request.setUserId(userId);
        Result<FileMetadataDTO> result = fileClient.createMetadata(properties.getFileInternalToken(), request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow image metadata registration failed");
        }
        return result.getData();
    }

    private String objectKey(String workflowId, String nodeId, String fileName) {
        String timestamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(OffsetDateTime.now());
        return trimSlashes(properties.getExportObjectPrefix()) + "/images/" + workflowId + "/" + nodeId + "/"
                + timestamp + "-" + UUID.randomUUID() + "-" + fileName;
    }

    private String contentType(ImageWorkflowDtos.GeneratedImage image) {
        return image.getContentType() == null || image.getContentType().isBlank()
                ? "image/png"
                : image.getContentType();
    }

    private String sanitize(String value) {
        String sanitized = value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return sanitized.isBlank() ? "image.png" : sanitized;
    }

    private String trimSlashes(String value) {
        return value == null ? "" : value.replaceAll("^/+", "").replaceAll("/+$", "");
    }
}
```

- [ ] **Step 4: Run storage test**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ImageArtifactStorageTest test
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ImageArtifactStorage.java backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/ImageArtifactStorageTest.java
git commit -m "feat(workflow): add image artifact storage"
```

---

### Task 8: Add workflow-service Image Nodes And Catalog Entries

**Files:**
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/PromptNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ImageGenerationNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/UpscaleNodeExecutor.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/SaveImageNodeExecutor.java`
- Modify: `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/ImageGenerationNodeExecutorTest.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java`

- [ ] **Step 1: Write image node executor test**

Create `ImageGenerationNodeExecutorTest.java` using mocked `AiWorkflowNodeClient` and `ImageArtifactStorage`:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ImageGenerationNodeExecutorTest {

    @Test
    void storesAiImagesAndWritesRuntimeVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        ImageArtifactStorage storage = mock(ImageArtifactStorage.class);
        ImageGenerationNodeExecutor executor = new ImageGenerationNodeExecutor(new WorkflowNodeMetrics(), aiClient, storage);
        DefaultWorkflowContext context = new DefaultWorkflowContext("wf", "trace", "task", Map.of(
                "userId", 100L,
                WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("node-image", Map.of(
                        "provider", "COMFYUI",
                        "prompt", "cat",
                        "negativePrompt", "blur",
                        "width", 512,
                        "height", 512
                ))
        ));
        context.updateCurrentNodeId("node-image");

        when(aiClient.execute(any())).thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                "IMAGE_GENERATION",
                "SUCCEEDED",
                Map.of(
                        "provider", "COMFYUI",
                        "mode", "txt2img",
                        "images", List.of(new ImageWorkflowDtos.GeneratedImage("image.png", "image/png", "aW1hZ2U=", 5L, Map.of())),
                        "metadata", Map.of("seed", 1)
                )
        )));
        when(storage.store(eq("wf"), eq("node-image"), eq(100L), any()))
                .thenReturn(new FileMetadataDTO(8L, "aetherflow", "workflow/images/wf/node-image/image.png",
                        "image.png", "image/png", 5L, "http://minio/image.png"));

        NodeResult result = executor.execute(context);

        assertThat(result.output()).containsKeys("imageFiles", "imageFileIds", "imageUrls", "imageGenerationMetadata");
        assertThat(result.variables().get("imageFileIds")).asList().containsExactly(8L);
        assertThat(result.variables().get("imageUrls")).asList().containsExactly("http://minio/image.png");
    }
}
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ImageGenerationNodeExecutorTest,WorkflowNodeCatalogControllerTest test
```

Expected: FAIL because image workflow node classes and catalog entries do not exist.

- [ ] **Step 3: Add node types**

Add to `WorkflowNodeTypes.java`:

```java
public static final NodeType PROMPT = NodeType.of("PROMPT");
public static final NodeType IMAGE_GENERATION = NodeType.of("IMAGE_GENERATION");
public static final NodeType UPSCALE = NodeType.of("UPSCALE");
public static final NodeType SAVE_IMAGE = NodeType.of("SAVE_IMAGE");
```

- [ ] **Step 4: Implement prompt node**

Create `PromptNodeExecutor.java`:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PromptNodeExecutor extends BaseNodeExecutor {

    public PromptNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.PROMPT, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String prompt = string(config.get("prompt"), string(context.variables().get("prompt"), ""));
        String negativePrompt = string(config.get("negativePrompt"), string(context.variables().get("negativePrompt"), ""));
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("prompt", prompt);
        output.put("negativePrompt", negativePrompt);
        output.put("promptMetadata", Map.of("source", context.currentNodeId()));
        return buildResult(output, output);
    }

    private String string(Object value, String fallback) {
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value);
    }
}
```

- [ ] **Step 5: Implement image generation node**

Create `ImageGenerationNodeExecutor.java`:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ImageGenerationNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;
    private final ImageArtifactStorage storage;

    public ImageGenerationNodeExecutor(WorkflowNodeMetrics metrics,
                                       AiWorkflowNodeClient aiClient,
                                       ImageArtifactStorage storage) {
        super(WorkflowNodeTypes.IMAGE_GENERATION, metrics);
        this.aiClient = aiClient;
        this.storage = storage;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        AiWorkflowNodeResponseDTO response = executeAi(context, config, "IMAGE_GENERATION");
        List<ImageWorkflowDtos.GeneratedImage> images = generatedImages(response.getOutput().get("images"));
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "image generation returned no images");
        }
        List<FileMetadataDTO> files = new ArrayList<>();
        Long userId = longValue(context.variables().get("userId"));
        for (ImageWorkflowDtos.GeneratedImage image : images) {
            files.add(storage.store(context.workflowId(), context.currentNodeId(), userId, image));
        }
        Map<String, Object> output = output(response, files);
        return buildResult(output, output);
    }

    protected AiWorkflowNodeResponseDTO executeAi(WorkflowContext context, Map<String, Object> config, String nodeType) {
        Map<String, Object> payload = new LinkedHashMap<>(config);
        payload.putIfAbsent("prompt", context.variables().getOrDefault("prompt", ""));
        payload.putIfAbsent("negativePrompt", context.variables().getOrDefault("negativePrompt", ""));
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType(nodeType);
        request.setPayload(payload);
        Result<AiWorkflowNodeResponseDTO> result = aiClient.execute(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "image node ai execution failed");
        }
        return result.getData();
    }

    private Map<String, Object> output(AiWorkflowNodeResponseDTO response, List<FileMetadataDTO> files) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("imageFiles", files);
        output.put("imageFileIds", files.stream().map(FileMetadataDTO::getId).toList());
        output.put("imageUrls", files.stream().map(FileMetadataDTO::getUrl).toList());
        output.put("imageObjectKeys", files.stream().map(FileMetadataDTO::getObjectKey).toList());
        output.put("imageGenerationMetadata", response.getOutput().getOrDefault("metadata", Map.of()));
        output.put("provider", response.getOutput().getOrDefault("provider", ""));
        output.put("mode", response.getOutput().getOrDefault("mode", ""));
        return output;
    }

    @SuppressWarnings("unchecked")
    private List<ImageWorkflowDtos.GeneratedImage> generatedImages(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<ImageWorkflowDtos.GeneratedImage> images = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof ImageWorkflowDtos.GeneratedImage image) {
                images.add(image);
            } else if (item instanceof Map<?, ?> map) {
                images.add(new ImageWorkflowDtos.GeneratedImage(
                        string(map.get("fileName"), "image.png"),
                        string(map.get("contentType"), "image/png"),
                        string(map.get("base64Data"), ""),
                        longValue(map.get("size")),
                        map.get("metadata") instanceof Map<?, ?> metadata ? (Map<String, Object>) metadata : Map.of()
                ));
            }
        }
        return images;
    }

    private String string(Object value, String fallback) {
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value);
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
```

- [ ] **Step 6: Implement upscale and save nodes**

Create `UpscaleNodeExecutor.java` as a standalone executor:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class UpscaleNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;
    private final ImageArtifactStorage storage;

    public UpscaleNodeExecutor(WorkflowNodeMetrics metrics,
                               AiWorkflowNodeClient aiClient,
                               ImageArtifactStorage storage) {
        super(WorkflowNodeTypes.UPSCALE, metrics);
        this.aiClient = aiClient;
        this.storage = storage;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Map<String, Object> payload = new LinkedHashMap<>(config);
        payload.putIfAbsent("sourceImageUrl", firstImageUrl(context));
        AiWorkflowNodeResponseDTO response = executeAi(context, payload, "UPSCALE");
        List<ImageWorkflowDtos.GeneratedImage> images = generatedImages(response.getOutput().get("images"));
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "upscale returned no images");
        }
        List<FileMetadataDTO> files = new ArrayList<>();
        Long userId = longValue(context.variables().get("userId"));
        for (ImageWorkflowDtos.GeneratedImage image : images) {
            files.add(storage.store(context.workflowId(), context.currentNodeId(), userId, image));
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("upscaledImageFiles", files);
        output.put("upscaledImageFileIds", files.stream().map(FileMetadataDTO::getId).toList());
        output.put("upscaledImageUrls", files.stream().map(FileMetadataDTO::getUrl).toList());
        output.put("upscaleMetadata", response.getOutput().getOrDefault("metadata", Map.of()));
        return buildResult(output, output);
    }

    private AiWorkflowNodeResponseDTO executeAi(WorkflowContext context, Map<String, Object> payload, String nodeType) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType(nodeType);
        request.setPayload(payload);
        Result<AiWorkflowNodeResponseDTO> result = aiClient.execute(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "upscale ai execution failed");
        }
        return result.getData();
    }

    private Object firstImageUrl(WorkflowContext context) {
        Object urls = context.variables().get("imageUrls");
        if (urls instanceof java.util.List<?> list && !list.isEmpty()) {
            return list.get(0);
        }
        return context.variables().getOrDefault("imageUrl", "");
    }

    @SuppressWarnings("unchecked")
    private List<ImageWorkflowDtos.GeneratedImage> generatedImages(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        List<ImageWorkflowDtos.GeneratedImage> images = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof ImageWorkflowDtos.GeneratedImage image) {
                images.add(image);
            } else if (item instanceof Map<?, ?> map) {
                images.add(new ImageWorkflowDtos.GeneratedImage(
                        string(map.get("fileName"), "image.png"),
                        string(map.get("contentType"), "image/png"),
                        string(map.get("base64Data"), ""),
                        longValue(map.get("size")),
                        map.get("metadata") instanceof Map<?, ?> metadata ? (Map<String, Object>) metadata : Map.of()
                ));
            }
        }
        return images;
    }

    private String string(Object value, String fallback) {
        return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value);
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return value == null || String.valueOf(value).isBlank() ? null : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }
}
```

Create `SaveImageNodeExecutor.java`:

```java
package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class SaveImageNodeExecutor extends BaseNodeExecutor {

    public SaveImageNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.SAVE_IMAGE, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("savedImageFiles", context.variables().getOrDefault("imageFiles", java.util.List.of()));
        output.put("savedImageFileIds", context.variables().getOrDefault("imageFileIds", java.util.List.of()));
        output.put("savedImageUrls", context.variables().getOrDefault("imageUrls", java.util.List.of()));
        output.put("savedImageObjectKeys", context.variables().getOrDefault("imageObjectKeys", java.util.List.of()));
        return buildResult(output, output);
    }
}
```

- [ ] **Step 7: Add catalog entries**

In `WorkflowNodeCatalogService.catalog()`, insert `promptNode()`, `imageGeneration()`, `upscale()`, `saveImage()` before `mock()`.

Add helper field constructors using UI metadata:

```java
private WorkflowNodeCatalogItem imageGeneration() {
    return item(
            "IMAGE_GENERATION",
            "Image Generation",
            "AI",
            "Generates images through Stable Diffusion WebUI or ComfyUI and stores generated artifacts.",
            List.of(
                    field("provider", "STRING", false, "Image provider.", "COMFYUI",
                            List.of("COMFYUI", "STABLE_DIFFUSION_WEBUI"), com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("select")),
                    field("mode", "STRING", false, "Generation mode.", "txt2img",
                            List.of("txt2img", "img2img", "workflow"), com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("select")),
                    field("prompt", "STRING", true, "Positive prompt.", "a cinematic cat", List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basic("textarea")),
                    field("negativePrompt", "STRING", false, "Negative prompt.", "blur", List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basic("textarea")),
                    field("seed", "NUMBER", false, "Generation seed.", -1, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basicNumber(-1, 2147483647, 1)),
                    field("steps", "NUMBER", false, "Sampling steps.", 30, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basicNumber(1, 150, 1)),
                    field("cfgScale", "NUMBER", false, "CFG scale.", 7.0, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basicNumber(1, 30, 0.5)),
                    field("sampler", "STRING", false, "Sampler.", "Euler a", List.of("Euler a", "DPM++ 2M", "DPM++ SDE"),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("select")),
                    field("scheduler", "STRING", false, "Scheduler.", "normal", List.of("normal", "karras", "exponential"),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("select")),
                    field("width", "NUMBER", false, "Image width.", 1024, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basicNumber(64, 4096, 8)),
                    field("height", "NUMBER", false, "Image height.", 1024, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basicNumber(64, 4096, 8)),
                    field("batchSize", "NUMBER", false, "Batch size.", 1, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advancedNumber(1, 16, 1)),
                    field("denoiseStrength", "NUMBER", false, "Denoise strength for img2img.", 0.6, List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advancedNumber(0, 1, 0.05)),
                    field("checkpoint", "STRING", false, "Checkpoint or model.", "sdxl.safetensors", List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.basic("text")),
                    field("vae", "STRING", false, "VAE.", "vae-ft-mse", List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("text")),
                    field("lora", "ARRAY", false, "LoRA list.", List.of(Map.of("name", "detail", "weight", 0.8)), List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("lora")),
                    field("workflowJson", "OBJECT", false, "ComfyUI workflow JSON.", Map.of(), List.of(),
                            com.aetherflow.common.dto.WorkflowNodeConfigUiSchema.advanced("json"))
            ),
            List.of(variable("prompt", "STRING", "Prompt text.", "a cinematic cat")),
            List.of(
                    variable("imageFileIds", "ARRAY", "Generated image file ids.", List.of(1001)),
                    variable("imageUrls", "ARRAY", "Generated image URLs.", List.of("http://minio/image.png"))
            ),
            mapOf("provider", "COMFYUI", "mode", "txt2img", "prompt", "", "negativePrompt", "",
                    "seed", -1, "steps", 30, "cfgScale", 7.0, "width", 1024, "height", 1024, "batchSize", 1)
    );
}
```

Add analogous `promptNode`, `upscale`, and `saveImage` entries with the output variables listed in the design spec.

- [ ] **Step 8: Run tests**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ImageGenerationNodeExecutorTest,WorkflowNodeCatalogControllerTest test
```

Expected: PASS after fixing any local compile issue in the `UpscaleNodeExecutor` inheritance noted above.

- [ ] **Step 9: Commit**

Run:

```powershell
git add -- backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/PromptNodeExecutor.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ImageGenerationNodeExecutor.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/UpscaleNodeExecutor.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/SaveImageNodeExecutor.java backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/ImageGenerationNodeExecutorTest.java backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java
git commit -m "feat(workflow): add image workflow nodes"
```

---

### Task 9: Add ComfyUI Workflow JSON Import

**Files:**
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/comfy/ComfyWorkflowImportService.java`
- Create: `backend/workflow-service/src/main/java/com/aetherflow/workflow/comfy/ComfyWorkflowImportController.java`
- Test: `backend/workflow-service/src/test/java/com/aetherflow/workflow/comfy/ComfyWorkflowImportServiceTest.java`

- [ ] **Step 1: Write import service test**

Create `ComfyWorkflowImportServiceTest.java`:

```java
package com.aetherflow.workflow.comfy;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComfyWorkflowImportServiceTest {

    @Test
    void importsPromptSamplerAndSaveImageAsAetherFlowDag() {
        ComfyWorkflowImportService service = new ComfyWorkflowImportService();
        Map<String, Object> workflow = Map.of(
                "1", Map.of("class_type", "CheckpointLoaderSimple", "inputs", Map.of("ckpt_name", "sdxl.safetensors")),
                "2", Map.of("class_type", "CLIPTextEncode", "inputs", Map.of("text", "cat")),
                "3", Map.of("class_type", "CLIPTextEncode", "inputs", Map.of("text", "blur")),
                "4", Map.of("class_type", "EmptyLatentImage", "inputs", Map.of("width", 1024, "height", 768, "batch_size", 2)),
                "5", Map.of("class_type", "KSampler", "inputs", Map.of("seed", 42, "steps", 30, "cfg", 7.5, "sampler_name", "euler", "scheduler", "normal", "denoise", 1.0)),
                "6", Map.of("class_type", "VAELoader", "inputs", Map.of("vae_name", "vae-ft-mse")),
                "7", Map.of("class_type", "LoraLoader", "inputs", Map.of("lora_name", "detail.safetensors", "strength_model", 0.8)),
                "8", Map.of("class_type", "SaveImage", "inputs", Map.of("filename_prefix", "aetherflow"))
        );

        WorkflowDefinitionDTO definition = service.importWorkflow("Imported Comfy", workflow);

        assertThat(definition.getNodes()).extracting("nodeType")
                .containsExactly("PROMPT", "IMAGE_GENERATION", "SAVE_IMAGE");
        assertThat(definition.getNodes().get(1).getConfig())
                .containsEntry("prompt", "cat")
                .containsEntry("negativePrompt", "blur")
                .containsEntry("checkpoint", "sdxl.safetensors")
                .containsEntry("width", 1024)
                .containsEntry("height", 768)
                .containsEntry("batchSize", 2)
                .containsEntry("seed", 42)
                .containsEntry("steps", 30)
                .containsEntry("cfgScale", 7.5)
                .containsEntry("vae", "vae-ft-mse");
        assertThat(definition.getNodes().get(1).getConfig().get("workflowJson")).isEqualTo(workflow);
    }
}
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ComfyWorkflowImportServiceTest test
```

Expected: FAIL because import service does not exist.

- [ ] **Step 3: Implement import service**

Create `ComfyWorkflowImportService.java`:

```java
package com.aetherflow.workflow.comfy;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ComfyWorkflowImportService {

    public WorkflowDefinitionDTO importWorkflow(String name, Map<String, Object> workflowJson) {
        Map<String, Object> imageConfig = imageConfig(workflowJson);
        WorkflowNodeDTO prompt = node("node-prompt", "PROMPT", "Prompt", Map.of(
                "prompt", string(imageConfig.get("prompt")),
                "negativePrompt", string(imageConfig.get("negativePrompt")),
                "nextNodes", List.of("node-image-generation")
        ));
        imageConfig.put("provider", "COMFYUI");
        imageConfig.put("mode", "workflow");
        imageConfig.put("workflowJson", workflowJson);
        imageConfig.put("nextNodes", List.of("node-save-image"));
        WorkflowNodeDTO image = node("node-image-generation", "IMAGE_GENERATION", "ComfyUI Image Generation", imageConfig);
        WorkflowNodeDTO save = node("node-save-image", "SAVE_IMAGE", "Save Image", Map.of());

        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName(name == null || name.isBlank() ? "Imported ComfyUI Workflow" : name);
        definition.setDescription("Imported from ComfyUI workflow JSON.");
        definition.setNodes(List.of(prompt, image, save));
        return definition;
    }

    private Map<String, Object> imageConfig(Map<String, Object> workflowJson) {
        Map<String, Object> config = new LinkedHashMap<>();
        for (Object value : workflowJson.values()) {
            if (!(value instanceof Map<?, ?> node)) {
                continue;
            }
            String classType = string(node.get("class_type"));
            Map<String, Object> inputs = inputs(node.get("inputs"));
            if ("CheckpointLoaderSimple".equals(classType)) {
                put(config, "checkpoint", inputs.get("ckpt_name"));
            } else if ("VAELoader".equals(classType)) {
                put(config, "vae", inputs.get("vae_name"));
            } else if ("LoraLoader".equals(classType)) {
                config.put("lora", List.of(Map.of(
                        "name", string(inputs.get("lora_name")),
                        "weight", number(inputs.get("strength_model"), 1.0D)
                )));
            } else if ("EmptyLatentImage".equals(classType)) {
                put(config, "width", inputs.get("width"));
                put(config, "height", inputs.get("height"));
                put(config, "batchSize", inputs.get("batch_size"));
            } else if ("KSampler".equals(classType)) {
                put(config, "seed", inputs.get("seed"));
                put(config, "steps", inputs.get("steps"));
                put(config, "cfgScale", inputs.get("cfg"));
                put(config, "sampler", inputs.get("sampler_name"));
                put(config, "scheduler", inputs.get("scheduler"));
                put(config, "denoiseStrength", inputs.get("denoise"));
            } else if ("CLIPTextEncode".equals(classType)) {
                String text = string(inputs.get("text"));
                if (!config.containsKey("prompt")) {
                    config.put("prompt", text);
                } else if (!config.containsKey("negativePrompt")) {
                    config.put("negativePrompt", text);
                }
            }
        }
        config.putIfAbsent("prompt", "");
        config.putIfAbsent("negativePrompt", "");
        config.putIfAbsent("width", 1024);
        config.putIfAbsent("height", 1024);
        config.putIfAbsent("batchSize", 1);
        config.putIfAbsent("steps", 30);
        config.putIfAbsent("cfgScale", 7.0D);
        return config;
    }

    private WorkflowNodeDTO node(String id, String type, String displayName, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id);
        node.setNodeType(type);
        node.setDisplayName(displayName);
        node.setConfig(config);
        return node;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> inputs(Object value) {
        return value instanceof Map<?, ?> map ? new LinkedHashMap<>((Map<String, Object>) map) : Map.of();
    }

    private void put(Map<String, Object> target, String key, Object value) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private String string(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private Double number(Object value, Double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return value == null ? fallback : Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }
}
```

- [ ] **Step 4: Add controller**

Create `ComfyWorkflowImportController.java`:

```java
package com.aetherflow.workflow.comfy;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/workflow/comfy")
@RequiredArgsConstructor
@Tag(name = "ComfyUI Workflow Import", description = "Imports ComfyUI workflow JSON into AetherFlow workflow DAG definitions.")
public class ComfyWorkflowImportController {

    private final ComfyWorkflowImportService importService;

    @PostMapping("/import")
    @Operation(summary = "Import ComfyUI workflow JSON")
    public Result<WorkflowDefinitionDTO> importWorkflow(@RequestBody ImportRequest request) {
        return Result.success(importService.importWorkflow(request.getName(), request.getWorkflowJson()));
    }

    @Data
    public static class ImportRequest {
        private String name;
        private Map<String, Object> workflowJson;
    }
}
```

- [ ] **Step 5: Run import test**

Run:

```powershell
mvn -pl backend/workflow-service -Dtest=ComfyWorkflowImportServiceTest test
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- backend/workflow-service/src/main/java/com/aetherflow/workflow/comfy backend/workflow-service/src/test/java/com/aetherflow/workflow/comfy/ComfyWorkflowImportServiceTest.java
git commit -m "feat(workflow): import comfyui workflows"
```

---

### Task 10: Add Frontend Image Nodes And Mapper Support

**Files:**
- Modify: `frontend/src/types/workflow.ts`
- Modify: `frontend/src/services/mock/workflowMock.ts`
- Modify: `frontend/src/api/mappers/workflowMapper.ts`
- Modify: `frontend/src/api/modules/node.ts`
- Create: `frontend/scripts/check-workflow-image-nodes.mjs`

- [ ] **Step 1: Write frontend check script**

Create `frontend/scripts/check-workflow-image-nodes.mjs`:

```javascript
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = {
  types: fs.readFileSync(path.join(root, 'src/types/workflow.ts'), 'utf8'),
  mock: fs.readFileSync(path.join(root, 'src/services/mock/workflowMock.ts'), 'utf8'),
  mapper: fs.readFileSync(path.join(root, 'src/api/mappers/workflowMapper.ts'), 'utf8'),
  inspector: fs.readFileSync(path.join(root, 'src/components/workflow/NodeInspector.vue'), 'utf8'),
}

const required = [
  [files.types, "'image-generation'", 'WorkflowNodeKind includes image-generation'],
  [files.types, "'prompt'", 'WorkflowNodeKind includes prompt'],
  [files.types, "'upscale'", 'WorkflowNodeKind includes upscale'],
  [files.types, "'save-image'", 'WorkflowNodeKind includes save-image'],
  [files.mock, "kind: 'image-generation'", 'image generation template exists'],
  [files.mapper, "IMAGE_GENERATION", 'mapper emits IMAGE_GENERATION'],
  [files.mapper, "normalizeImageGenerationConfig", 'image config normalizer exists'],
  [files.inspector, "image-generation", 'inspector renders image node panel'],
  [files.inspector, "advancedImageMode", 'inspector has advanced mode'],
]

const missing = required.filter(([content, needle]) => !content.includes(needle))
if (missing.length > 0) {
  console.error(missing.map(([, , label]) => `Missing: ${label}`).join('\n'))
  process.exit(1)
}

console.log('workflow image node frontend checks passed')
```

- [ ] **Step 2: Run failing script**

Run:

```powershell
Push-Location frontend; node scripts/check-workflow-image-nodes.mjs; Pop-Location
```

Expected: FAIL listing missing image node support.

- [ ] **Step 3: Extend workflow types**

In `frontend/src/types/workflow.ts`, add node kinds:

```ts
  | 'prompt'
  | 'image-generation'
  | 'upscale'
  | 'save-image'
```

If TypeScript rejects `WorkflowNodeData.config` because image `lora` or `workflowJson` is object-like, widen config:

```ts
export type WorkflowConfigValue = string | number | boolean | Record<string, unknown> | unknown[]
```

Then change both config declarations to:

```ts
config: Record<string, WorkflowConfigValue>
```

- [ ] **Step 4: Add image templates**

Append to `nodeTemplates` in `workflowMock.ts`:

```ts
{
  kind: 'prompt',
  label: 'Prompt',
  description: 'Build positive and negative prompts for image generation.',
  category: 'AI',
  catalog: 'node',
  group: 'recommended',
  config: { prompt: '', negativePrompt: '' },
  inputs: ['context.text'],
  outputs: ['prompt', 'negativePrompt', 'promptMetadata'],
},
{
  kind: 'image-generation',
  label: 'Image Generation',
  description: 'Generate images through Stable Diffusion WebUI or ComfyUI.',
  category: 'AI',
  catalog: 'node',
  group: 'recommended',
  config: {
    provider: 'COMFYUI',
    mode: 'txt2img',
    prompt: '',
    negativePrompt: '',
    seed: -1,
    steps: 30,
    cfgScale: 7,
    sampler: 'Euler a',
    scheduler: 'normal',
    width: 1024,
    height: 1024,
    batchSize: 1,
    denoiseStrength: 0.6,
    checkpoint: '',
    vae: '',
    lora: [],
    workflowJson: {},
  },
  inputs: ['prompt', 'negativePrompt', 'source.image'],
  outputs: ['imageFileIds', 'imageUrls', 'imageGenerationMetadata'],
},
{
  kind: 'upscale',
  label: 'Upscale',
  description: 'Upscale an upstream generated or uploaded image.',
  category: 'Media',
  catalog: 'node',
  group: 'recommended',
  config: { provider: 'COMFYUI', sourceImageVariable: 'imageUrls', scale: 2, denoiseStrength: 0.35 },
  inputs: ['imageUrls'],
  outputs: ['upscaledImageFileIds', 'upscaledImageUrls', 'upscaleMetadata'],
},
{
  kind: 'save-image',
  label: 'Save Image',
  description: 'Normalize generated image artifacts for downstream output.',
  category: 'Output',
  catalog: 'node',
  group: 'recommended',
  config: { sourceVariable: 'imageFiles', outputVariable: 'savedImageFiles' },
  inputs: ['imageFiles'],
  outputs: ['savedImageFileIds', 'savedImageUrls', 'savedImageObjectKeys'],
},
```

- [ ] **Step 5: Extend mapper**

In `workflowMapper.ts`, add backend types:

```ts
  | 'PROMPT'
  | 'IMAGE_GENERATION'
  | 'UPSCALE'
  | 'SAVE_IMAGE'
```

Add mappings:

```ts
  prompt: 'PROMPT',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
  'save-image': 'SAVE_IMAGE',
```

Add normalizers:

```ts
function normalizePromptConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    prompt: stringValue(config.prompt, ''),
    negativePrompt: stringValue(config.negativePrompt, ''),
  }, nextNodes)
}

function normalizeImageGenerationConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    provider: stringValue(config.provider, 'COMFYUI'),
    mode: stringValue(config.mode, 'txt2img'),
    prompt: stringValue(config.prompt, ''),
    negativePrompt: stringValue(config.negativePrompt, ''),
    seed: Math.floor(numberValue(config.seed, -1)),
    steps: Math.max(1, Math.floor(numberValue(config.steps, 30))),
    cfgScale: numberValue(config.cfgScale, 7),
    sampler: stringValue(config.sampler, 'Euler a'),
    scheduler: stringValue(config.scheduler, 'normal'),
    width: Math.max(64, Math.floor(numberValue(config.width, 1024))),
    height: Math.max(64, Math.floor(numberValue(config.height, 1024))),
    batchSize: Math.max(1, Math.floor(numberValue(config.batchSize, 1))),
    denoiseStrength: numberValue(config.denoiseStrength, 0.6),
    checkpoint: stringValue(config.checkpoint, ''),
    vae: stringValue(config.vae, ''),
    lora: Array.isArray(config.lora) ? config.lora : [],
    workflowJson: toRecord(config.workflowJson),
  }, nextNodes)
}

function normalizeUpscaleConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    provider: stringValue(config.provider, 'COMFYUI'),
    sourceImageVariable: stringValue(config.sourceImageVariable, 'imageUrls'),
    scale: Math.max(1, numberValue(config.scale, 2)),
    denoiseStrength: numberValue(config.denoiseStrength, 0.35),
  }, nextNodes)
}

function normalizeSaveImageConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    sourceVariable: stringValue(config.sourceVariable, 'imageFiles'),
    outputVariable: stringValue(config.outputVariable, 'savedImageFiles'),
  }, nextNodes)
}
```

Add switch cases:

```ts
    case 'PROMPT':
      return normalizePromptConfig(config, nextNodes)
    case 'IMAGE_GENERATION':
      return normalizeImageGenerationConfig(config, nextNodes)
    case 'UPSCALE':
      return normalizeUpscaleConfig(config, nextNodes)
    case 'SAVE_IMAGE':
      return normalizeSaveImageConfig(config, nextNodes)
```

- [ ] **Step 6: Update node catalog API type**

In `frontend/src/api/modules/node.ts`, add:

```ts
export interface WorkflowNodeConfigUiSchema {
  mode?: 'basic' | 'advanced'
  control?: string
  min?: number
  max?: number
  step?: number
}
```

Change `configSchema` to:

```ts
configSchema?: Array<{
  name?: string
  type?: string
  required?: boolean
  description?: string
  example?: unknown
  options?: string[]
  ui?: WorkflowNodeConfigUiSchema
}>
```

- [ ] **Step 7: Run frontend check**

Run:

```powershell
Push-Location frontend; node scripts/check-workflow-image-nodes.mjs; Pop-Location
```

Expected: still FAIL only because inspector panel is not implemented.

- [ ] **Step 8: Commit**

Run:

```powershell
git add -- frontend/src/types/workflow.ts frontend/src/services/mock/workflowMock.ts frontend/src/api/mappers/workflowMapper.ts frontend/src/api/modules/node.ts frontend/scripts/check-workflow-image-nodes.mjs
git commit -m "feat(frontend): add image workflow node mappings"
```

---

### Task 11: Add Frontend Dynamic Image Parameter Panel

**Files:**
- Modify: `frontend/src/components/workflow/NodeInspector.vue`
- Modify: `frontend/src/components/workflow/WorkflowNode.vue`
- Modify: `frontend/src/components/workflow/NodeAddMenu.vue`
- Modify: `frontend/src/components/workflow/NodePalette.vue`
- Modify: `frontend/src/i18n/locales/zh-CN.ts`
- Modify: `frontend/src/i18n/locales/en-US.ts`
- Modify: `frontend/src/i18n/locales/ja-JP.ts`
- Test: `frontend/scripts/check-workflow-image-nodes.mjs`

- [ ] **Step 1: Add icons and image mode state**

In `NodeInspector.vue`, import image icons:

```ts
import { Image, WandSparkles, Save, Maximize2 } from 'lucide-vue-next'
```

Add icon mappings:

```ts
  prompt: WandSparkles,
  'image-generation': Image,
  upscale: Maximize2,
  'save-image': Save,
```

Add state:

```ts
const advancedImageMode = ref(false)
const imageBasicFields = ['prompt', 'negativePrompt', 'width', 'height', 'steps', 'cfgScale', 'seed', 'checkpoint']
const imageAdvancedFields = ['provider', 'mode', 'sampler', 'scheduler', 'batchSize', 'denoiseStrength', 'vae', 'lora', 'workflowJson', 'timeoutSeconds']
```

- [ ] **Step 2: Add image config helpers**

Add helpers in `NodeInspector.vue`:

```ts
function imageFieldValue(key: string) {
  const value = configValue(key, '')
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

function handleJsonInput(key: string, event: Event) {
  const raw = (event.target as HTMLTextAreaElement).value
  try {
    updateConfig(key, JSON.parse(raw))
  } catch {
    updateConfig(key, raw)
  }
}

function handleImageFieldInput(key: string, event: Event) {
  if (['width', 'height', 'steps', 'cfgScale', 'seed', 'batchSize', 'denoiseStrength', 'timeoutSeconds'].includes(key)) {
    handleNumberInput(key, event)
    return
  }
  if (key === 'lora' || key === 'workflowJson') {
    handleJsonInput(key, event)
    return
  }
  handleTextInput(key, event)
}
```

- [ ] **Step 3: Add image panel template**

Before the existing final fallback panel in `NodeInspector.vue`, add:

```vue
<section v-else-if="selectedKind === 'prompt' || selectedKind === 'image-generation' || selectedKind === 'upscale' || selectedKind === 'save-image'" class="space-y-5 p-5">
  <div v-if="selectedKind === 'image-generation'" class="flex rounded-lg border border-app-border bg-app-bg2 p-1">
    <button
      type="button"
      class="flex-1 rounded-md px-3 py-2 text-sm font-semibold"
      :class="!advancedImageMode ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'"
      @click="advancedImageMode = false"
    >
      {{ t('workflow.inspector.basicMode') }}
    </button>
    <button
      type="button"
      class="flex-1 rounded-md px-3 py-2 text-sm font-semibold"
      :class="advancedImageMode ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'"
      @click="advancedImageMode = true"
    >
      {{ t('workflow.inspector.advancedMode') }}
    </button>
  </div>

  <template v-if="selectedKind === 'prompt'">
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.prompt') }}</span>
      <textarea class="min-h-32 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('prompt', '')" @input="handleTextInput('prompt', $event)" />
    </label>
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.negativePrompt') }}</span>
      <textarea class="min-h-24 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('negativePrompt', '')" @input="handleTextInput('negativePrompt', $event)" />
    </label>
  </template>

  <template v-else-if="selectedKind === 'image-generation'">
    <label v-for="key in (advancedImageMode ? imageAdvancedFields : imageBasicFields)" :key="key" class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t(`workflow.inspector.imageFields.${key}`) }}</span>
      <textarea
        v-if="key === 'prompt' || key === 'negativePrompt' || key === 'lora' || key === 'workflowJson'"
        class="min-h-24 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
        :value="imageFieldValue(key)"
        @input="handleImageFieldInput(key, $event)"
      />
      <input
        v-else-if="['width', 'height', 'steps', 'cfgScale', 'seed', 'batchSize', 'denoiseStrength', 'timeoutSeconds'].includes(key)"
        type="number"
        class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
        :value="numberConfig(key, key === 'seed' ? -1 : 0)"
        @input="handleImageFieldInput(key, $event)"
      />
      <input
        v-else
        class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
        :value="textConfig(key, '')"
        @input="handleImageFieldInput(key, $event)"
      />
    </label>
  </template>

  <template v-else-if="selectedKind === 'upscale'">
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.sourceImageVariable') }}</span>
      <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('sourceImageVariable', 'imageUrls')" @input="handleTextInput('sourceImageVariable', $event)" />
    </label>
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.scale') }}</span>
      <input type="number" class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="numberConfig('scale', 2)" @input="handleNumberInput('scale', $event)" />
    </label>
  </template>

  <template v-else>
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.sourceVariable') }}</span>
      <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('sourceVariable', 'imageFiles')" @input="handleTextInput('sourceVariable', $event)" />
    </label>
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariable') }}</span>
      <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('outputVariable', 'savedImageFiles')" @input="handleTextInput('outputVariable', $event)" />
    </label>
  </template>
</section>
```

- [ ] **Step 4: Add i18n keys**

Add to each locale under `workflow.inspector`:

```ts
basicMode: 'Basic',
advancedMode: 'Advanced',
prompt: 'Prompt',
negativePrompt: 'Negative prompt',
sourceImageVariable: 'Source image variable',
scale: 'Scale',
sourceVariable: 'Source variable',
outputVariable: 'Output variable',
imageFields: {
  provider: 'Provider',
  mode: 'Mode',
  prompt: 'Prompt',
  negativePrompt: 'Negative prompt',
  seed: 'Seed',
  steps: 'Steps',
  cfgScale: 'CFG scale',
  sampler: 'Sampler',
  scheduler: 'Scheduler',
  width: 'Width',
  height: 'Height',
  batchSize: 'Batch size',
  denoiseStrength: 'Denoise strength',
  checkpoint: 'Checkpoint',
  vae: 'VAE',
  lora: 'LoRA',
  workflowJson: 'Workflow JSON',
  timeoutSeconds: 'Timeout seconds',
},
```

Use translated values for `zh-CN.ts` and `ja-JP.ts`.

- [ ] **Step 5: Update other node displays if they use exhaustive mappings**

If `WorkflowNode.vue`, `NodeAddMenu.vue`, or `NodePalette.vue` has an exhaustive `Record<WorkflowNodeKind, Component>` or label fallback, add entries for the four image kinds using `Image`, `WandSparkles`, `Maximize2`, and `Save`.

- [ ] **Step 6: Run frontend checks**

Run:

```powershell
Push-Location frontend; node scripts/check-workflow-image-nodes.mjs; npm run build; Pop-Location
```

Expected: check script passes and Vite build completes.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- frontend/src/components/workflow/NodeInspector.vue frontend/src/components/workflow/WorkflowNode.vue frontend/src/components/workflow/NodeAddMenu.vue frontend/src/components/workflow/NodePalette.vue frontend/src/i18n/locales/zh-CN.ts frontend/src/i18n/locales/en-US.ts frontend/src/i18n/locales/ja-JP.ts
git commit -m "feat(frontend): add image node parameter panels"
```

---

### Task 12: Configuration, Full Verification, And Cleanup

**Files:**
- Modify: `backend/ai-service/src/main/resources/application.yml`
- Modify: `backend/ai-service/src/main/resources/application-prod.yml`
- Modify: `backend/workflow-service/src/main/resources/application.yml`
- Modify: `backend/workflow-service/src/main/resources/application-prod.yml`
- Optional Modify: `docs/COMMON_CONTRACTS.md`

- [ ] **Step 1: Add ai-service image config**

Add to ai-service application files:

```yaml
aetherflow:
  ai:
    image:
      default-timeout: 5m
      stable-diffusion:
        enabled: false
        base-url: ${SD_WEBUI_BASE_URL:http://127.0.0.1:7860}
      comfy:
        enabled: false
        base-url: ${COMFYUI_BASE_URL:http://127.0.0.1:8188}
        poll-interval: 1s
        max-wait: 10m
```

- [ ] **Step 2: Add workflow-service image storage config if needed**

If `aetherflow.workflow.node.export-object-prefix` already exists, document that image nodes use `${exportObjectPrefix}/images`. If no config entry exists, add:

```yaml
aetherflow:
  workflow:
    node:
      export-object-prefix: ${WORKFLOW_EXPORT_OBJECT_PREFIX:workflow/exports}
```

- [ ] **Step 3: Document catalog schema contract**

If `WorkflowNodeConfigSchema.ui` was added, append to `docs/COMMON_CONTRACTS.md`:

```markdown
## Workflow Node Catalog UI Metadata

`WorkflowNodeConfigSchema.ui` is optional metadata for frontend form rendering. Backend validation must not depend on UI metadata. Existing clients may ignore it safely.

Supported fields:

- `mode`: `basic` or `advanced`
- `control`: frontend control hint such as `text`, `textarea`, `number`, `select`, `json`, or `lora`
- `min`, `max`, `step`: optional numeric control constraints
```

- [ ] **Step 4: Run backend targeted tests**

Run:

```powershell
mvn -pl backend/common,backend/ai-service,backend/workflow-service,backend/file-service -am test
```

Expected: PASS.

- [ ] **Step 5: Run frontend verification**

Run:

```powershell
Push-Location frontend
node scripts/check-workflow-image-nodes.mjs
npm run build
Pop-Location
```

Expected: PASS and build completes.

- [ ] **Step 6: Check diff hygiene**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. `git status --short` may show unrelated pre-existing working tree changes; only this task's files should be staged for commits.

- [ ] **Step 7: Commit final config/docs**

Run:

```powershell
git add -- backend/ai-service/src/main/resources/application.yml backend/ai-service/src/main/resources/application-prod.yml backend/workflow-service/src/main/resources/application.yml backend/workflow-service/src/main/resources/application-prod.yml docs/COMMON_CONTRACTS.md
git commit -m "chore: configure image workflow providers"
```

If `docs/COMMON_CONTRACTS.md` was not changed, omit it from `git add`.

---

## Plan Self-Review

Spec coverage:

- Stable Diffusion WebUI Provider: Task 4.
- ComfyUI Provider with Workflow/Queue/History APIs: Task 5.
- PromptNode/ImageGenerationNode/UpscaleNode/SaveImageNode: Tasks 6 and 8.
- txt2img/img2img, SDXL, Flux, LoRA, VAE parameters: Tasks 4, 6, 8, 10, 11. SDXL/Flux are represented through checkpoint/provider runtime config because model availability is external.
- ComfyUI workflow JSON import: Task 9.
- Required node parameters: Tasks 8, 10, 11.
- Frontend basic/advanced dynamic panel: Task 11.
- MinIO storage and runtime writeback: Tasks 7 and 8.
- No workflow runtime core refactor: enforced by Preconditions.

No placeholder tokens remain. Unknown ComfyUI nodes are intentionally preserved in `workflowJson` as a compatibility behavior.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-06-06-enterprise-image-workflow-nodes.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, faster iteration.

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
