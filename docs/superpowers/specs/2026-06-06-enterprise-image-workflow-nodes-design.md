# Enterprise Image Workflow Nodes Design

## Scope

This design adds an enterprise image generation node system to AetherFlow without refactoring the existing workflow runtime. It uses the current plugin-style node architecture:

- `workflow-runtime-api` remains unchanged.
- `workflow-service` registers new `NodeExecutor` Spring beans and owns workflow variables, DAG traversal compatibility, MinIO persistence, and file metadata registration.
- `ai-service` owns image provider protocols and execution against Stable Diffusion WebUI and ComfyUI.
- The frontend extends the workflow builder with dynamic image node configuration panels and keeps existing nodes intact.

The implementation covers:

- Stable Diffusion WebUI Provider.
- ComfyUI Provider.
- `PROMPT`, `IMAGE_GENERATION`, `UPSCALE`, and `SAVE_IMAGE` workflow nodes.
- ComfyUI workflow JSON import into AetherFlow DAG.
- Dynamic parameter panel with basic and advanced modes.
- Automatic generated-image storage in MinIO and runtime variable writeback.

## Current Architecture Findings

The workflow runtime is already designed for plugin nodes:

- `NodeType` is a value object, so new node types do not require changing `workflow-runtime-api`.
- `workflow-service` injects node config into workflow variables under `__workflowNodeConfigs`.
- `BaseNodeExecutor` reads the current node config from the runtime context and returns `NodeResult`.
- Runtime merges `NodeResult.variables()` into `WorkflowContext.variables()` and persists them through runtime snapshots.
- Existing AI workflow nodes use `workflow-service -> ai-service /ai/internal/workflow/nodes/execute -> AiNodeExecutor`.
- Existing export flow already stores generated content in MinIO and registers metadata through file-service.

The new image nodes should follow these boundaries rather than introducing runtime-specific image logic.

## Recommended Architecture

Use option 2: image providers live in `ai-service`, while workflow nodes live in `workflow-service`.

### ai-service

Add an image provider layer:

- `ImageGenerationProvider`
- `ImageGenerationRequest`
- `ImageGenerationResponse`
- `GeneratedImage`
- `ImageProviderType`

Provider implementations:

- `StableDiffusionWebUiProvider`
- `ComfyUiProvider`

AI node executors:

- `ImageGenerationAiNodeExecutor`
- `UpscaleAiNodeExecutor`
- `PromptAiNodeExecutor`

The AI layer returns generated image payloads and metadata. It does not write workflow runtime state.

### workflow-service

Add workflow node types:

- `PROMPT`
- `IMAGE_GENERATION`
- `UPSCALE`
- `SAVE_IMAGE`

Workflow node responsibilities:

- Read node config through `BaseNodeExecutor`.
- Resolve inputs from workflow variables and upstream node outputs.
- Call `ai-service` internal workflow node execution.
- Store image bytes/base64 outputs in MinIO.
- Register each stored image with file-service.
- Return `NodeResult.output()` and `NodeResult.variables()` containing image file metadata and provider metadata.

Runtime writeback happens through existing runtime snapshot persistence. No runtime core changes are needed.

## Provider Support

### Stable Diffusion WebUI Provider

The provider supports:

- `txt2img`
- `img2img`
- SDXL
- Flux where supported by the target WebUI runtime/checkpoint
- LoRA prompt injection or explicit alwayson scripts where available
- VAE selection
- checkpoint/model selection

Protocol:

- `POST /sdapi/v1/txt2img`
- `POST /sdapi/v1/img2img`
- `GET /sdapi/v1/progress`
- optional `GET /sdapi/v1/options`
- optional `POST /sdapi/v1/options` for checkpoint/VAE switching when enabled

Provider output:

- images as base64 or bytes
- seed info
- infotext / parameters
- provider metadata

### ComfyUI Provider

The provider supports:

- Workflow API execution with workflow JSON payloads.
- Queue API through `POST /prompt`.
- History API through `GET /history/{prompt_id}`.
- Image retrieval through ComfyUI output image endpoints.

Execution model:

1. Build or accept a ComfyUI workflow JSON.
2. Submit to queue.
3. Poll history until complete or timeout.
4. Fetch output images.
5. Return generated images and metadata to workflow-service.

## Node Parameter Contract

The following parameters are supported by image-capable nodes and preserved in node config:

- `prompt`
- `negativePrompt`
- `seed`
- `steps`
- `cfgScale`
- `sampler`
- `scheduler`
- `width`
- `height`
- `batchSize`
- `denoiseStrength`
- `checkpoint`
- `vae`
- `lora`

Additional production parameters:

- `provider`: `STABLE_DIFFUSION_WEBUI` or `COMFYUI`
- `mode`: `txt2img`, `img2img`, or `workflow`
- `sourceImageFileId`
- `sourceImageVariable`
- `workflowJson`
- `outputVariable`
- `outputDirectory`
- `timeoutSeconds`

LoRA config is normalized as a list of:

- `name`
- `weight`

For Stable Diffusion WebUI, LoRA can be rendered into prompt syntax when no structured API is available.

## Workflow Nodes

### PromptNode

Type: `PROMPT`

Purpose:

- Build positive and negative prompts from fixed text, variables, and optional template fragments.
- Normalize prompt output for downstream image nodes.

Outputs:

- `prompt`
- `negativePrompt`
- `promptMetadata`

### ImageGenerationNode

Type: `IMAGE_GENERATION`

Purpose:

- Execute txt2img, img2img, SDXL, Flux, LoRA, VAE, and ComfyUI workflows through ai-service.
- Store generated images to MinIO.
- Register file metadata.
- Write image references back to runtime variables.

Outputs:

- `imageFiles`
- `imageFileIds`
- `imageUrls`
- `imageObjectKeys`
- `imageGenerationMetadata`

### UpscaleNode

Type: `UPSCALE`

Purpose:

- Resolve an input image from file id, URL, or upstream image variable.
- Call ai-service upscale execution.
- Store upscaled images and write runtime variables.

Outputs:

- `upscaledImageFiles`
- `upscaledImageFileIds`
- `upscaledImageUrls`
- `upscaleMetadata`

### SaveImageNode

Type: `SAVE_IMAGE`

Purpose:

- Persist existing image payloads or image references to MinIO.
- Register file metadata.
- Normalize generated artifacts for downstream output nodes.

Outputs:

- `savedImageFiles`
- `savedImageFileIds`
- `savedImageUrls`
- `savedImageObjectKeys`

## ComfyUI Workflow JSON Import

Add a workflow import service in `workflow-service`.

Input:

- ComfyUI exported `workflow.json`.

Output:

- AetherFlow `WorkflowDefinitionDTO`.

Mapping strategy:

- Detect prompt nodes such as `CLIPTextEncode`.
- Detect negative prompt by graph position or sampler input name.
- Detect checkpoint nodes.
- Detect VAE nodes.
- Detect LoRA loader nodes.
- Detect sampler nodes such as `KSampler`.
- Detect image size from latent/image creation nodes.
- Detect source image nodes for img2img workflows.
- Detect save/output nodes.

Converted DAG:

- simple workflows become `PROMPT -> IMAGE_GENERATION -> SAVE_IMAGE`.
- complex or unknown workflows preserve original `workflowJson` inside the image generation node config and run through the ComfyUI provider.

This gives AetherFlow a readable DAG while preserving ComfyUI compatibility.

## Frontend Design

Frontend changes are additive:

- Add image node templates to the workflow palette.
- Extend `WorkflowNodeKind`.
- Extend backend node type mapping in `workflowMapper.ts`.
- Add a schema-driven image configuration renderer in `NodeInspector.vue`.
- Keep existing hard-coded node panels for current nodes.

Dynamic parameter panel:

- Basic mode shows common generation settings.
- Advanced mode shows provider-specific and expert settings.

Basic fields:

- `prompt`
- `negativePrompt`
- `width`
- `height`
- `steps`
- `cfgScale`
- `seed`
- `checkpoint`

Advanced fields:

- `sampler`
- `scheduler`
- `batchSize`
- `denoiseStrength`
- `vae`
- `lora`
- `provider`
- `mode`
- `workflowJson`
- `timeoutSeconds`

The backend node catalog should expose enough config metadata for this renderer. A small catalog schema extension is acceptable and should be explicitly covered by tests.

## Storage And Runtime Writeback

Generated images are stored by workflow-service after AI execution:

1. `ai-service` returns generated image content and metadata.
2. `workflow-service` writes each image to MinIO under a workflow image prefix.
3. `workflow-service` calls file-service internal metadata API.
4. `workflow-service` returns registered file metadata in `NodeResult`.
5. Runtime merges variables and persists them in the existing runtime snapshot.

No direct runtime mutation or runtime API change is needed.

## Error Handling

Provider errors:

- Invalid request parameters return `BAD_REQUEST`.
- Unreachable provider returns `SERVICE_UNAVAILABLE`.
- Queue timeout returns `SERVICE_UNAVAILABLE` with provider-specific metadata in logs.

Workflow node errors:

- Missing prompt/source image produces `BAD_REQUEST`.
- Failed MinIO upload produces `SERVICE_UNAVAILABLE`.
- Failed file metadata registration produces `SERVICE_UNAVAILABLE`.

Runtime retry remains owned by existing runtime retry policy.

## Configuration

Add configuration under existing service-specific properties.

`ai-service`:

- Stable Diffusion WebUI base URL.
- ComfyUI base URL.
- provider timeout.
- queue polling interval.
- max queue wait.
- provider enable flags.

`workflow-service`:

- image object prefix.
- allowed image content types.
- generated image file name policy.
- existing MinIO and file internal token configuration are reused.

## Testing

Backend unit tests:

- Stable Diffusion WebUI request mapping.
- Stable Diffusion WebUI txt2img/img2img response parsing.
- ComfyUI queue and history polling.
- ComfyUI workflow import parser.
- Image generation workflow node stores images and registers file metadata.
- Upscale workflow node stores results.
- Save image workflow node normalizes outputs.
- Node catalog exposes all required image parameters.
- Runtime snapshot contains image variables after node completion.

Frontend tests/checks:

- Image nodes appear in palette.
- Basic/advanced mode toggles render expected fields.
- Workflow mapper emits correct backend node types and full config.
- Imported ComfyUI workflow creates an AetherFlow DAG shape.

Primary verification:

- `git diff --check`
- targeted Java tests for `backend/common`, `backend/ai-service`, `backend/workflow-service`, and `backend/file-service`
- targeted frontend build or workflow mapper checks

## Risks

- ComfyUI exported JSON shape varies between UI versions, so import must preserve unknown workflow JSON instead of dropping nodes.
- SDXL and Flux support depends on the target provider runtime and installed checkpoints, so AetherFlow should validate config shape but not guarantee model availability.
- LoRA and VAE switching can be provider-specific; normalized config should remain stable even when execution adapters differ.
- Dynamic frontend rendering needs a small catalog schema extension. This is a contract change and must be documented in implementation planning.
