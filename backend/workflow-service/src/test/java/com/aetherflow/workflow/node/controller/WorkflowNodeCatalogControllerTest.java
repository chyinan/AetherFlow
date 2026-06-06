package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogItem;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import com.aetherflow.workflow.node.catalog.WorkflowNodeConfigSchema;
import com.aetherflow.workflow.node.catalog.WorkflowNodeVariableSchema;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowNodeCatalogControllerTest {

    @Test
    void exposesFrontendWorkflowNodeCatalog() {
        WorkflowNodeCatalogController controller = new WorkflowNodeCatalogController(new WorkflowNodeCatalogService());

        Result<List<WorkflowNodeCatalogItem>> result = controller.catalog();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData())
                .extracting(WorkflowNodeCatalogItem::type)
                .containsExactly(
                        "START",
                        "END",
                        "UPLOAD",
                        "OCR",
                        "WHISPER",
                        "LLM",
                        "TRANSLATE",
                        "SUMMARY",
                        "EMBEDDING",
                        "KNOWLEDGE_RETRIEVAL",
                        "PROMPT",
                        "IMAGE_GENERATION",
                        "UPSCALE",
                        "SAVE_IMAGE",
                        "EXPORT",
                        "NOTIFY",
                        "AGENT",
                        "QUESTION_UNDERSTAND",
                        "QUESTION_CLASSIFIER",
                        "CONDITION",
                        "HUMAN",
                        "ITERATION",
                        "LOOP",
                        "CODE",
                        "TEMPLATE_TRANSFORM",
                        "VARIABLE_AGGREGATE",
                        "VARIABLE_ASSIGNER",
                        "PARAMETER_EXTRACTOR",
                        "MOCK"
                );

        WorkflowNodeCatalogItem upload = item(result.getData(), "UPLOAD");
        assertThat(upload.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("fileId", "fileIdVariable");
        assertThat(upload.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("fileUrl", "fileObjectKey", "fileSize");
        assertThat(upload.exampleConfig()).containsEntry("fileIdVariable", "fileId");

        WorkflowNodeCatalogItem ocr = item(result.getData(), "OCR");
        assertThat(ocr.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("fileId", "fileIdVariable", "language", "enableTable", "enableLayout", "mock");
        assertThat(ocr.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("ocrText", "ocrLanguage", "ocrConfidence", "ocrPageCount");
        assertThat(ocr.exampleConfig()).containsEntry("language", "auto");

        WorkflowNodeCatalogItem embedding = item(result.getData(), "EMBEDDING");
        assertThat(embedding.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("provider", "model", "chunkSize", "overlap", "textVariable", "vectorCollection");
        assertThat(embedding.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("embeddingResults", "embeddingVectors", "embeddingVectorCount", "embeddingModel");
        assertThat(embedding.exampleConfig()).containsEntry("provider", "ollama");
        assertThat(embedding.exampleConfig()).containsEntry("chunkSize", 512);

        WorkflowNodeCatalogItem imageGeneration = item(result.getData(), "IMAGE_GENERATION");
        assertThat(imageGeneration.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains(
                        "provider",
                        "mode",
                        "prompt",
                        "negativePrompt",
                        "seed",
                        "steps",
                        "cfgScale",
                        "sampler",
                        "scheduler",
                        "width",
                        "height",
                        "batchSize",
                        "denoiseStrength",
                        "checkpoint",
                        "vae",
                        "lora"
                );
        assertThat(imageGeneration.configSchema())
                .filteredOn(schema -> "prompt".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.ui().mode()).isEqualTo("basic"));
        assertThat(imageGeneration.configSchema())
                .filteredOn(schema -> "checkpoint".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.ui().mode()).isEqualTo("advanced"));
        assertThat(imageGeneration.configSchema())
                .filteredOn(schema -> "sampler".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.options()).contains("DPM++ 2M", "Euler", "UniPC"));
        assertThat(imageGeneration.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("imageFiles", "imageFileIds", "imageUrls", "imageGenerationMetadata");

        WorkflowNodeCatalogItem prompt = item(result.getData(), "PROMPT");
        assertThat(prompt.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("prompt", "negativePrompt", "stylePreset", "promptVersion");
        assertThat(prompt.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("prompt", "negativePrompt", "promptMetadata");

        WorkflowNodeCatalogItem upscale = item(result.getData(), "UPSCALE");
        assertThat(upscale.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("provider", "sourceImageVariable", "scale", "upscaler");
        assertThat(upscale.configSchema())
                .filteredOn(schema -> "upscaler".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.options()).contains("R-ESRGAN 4x+", "Lanczos"));
        assertThat(upscale.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("upscaledImageFiles", "upscaledImageFileIds", "upscaledImageUrls", "upscaleMetadata");

        WorkflowNodeCatalogItem saveImage = item(result.getData(), "SAVE_IMAGE");
        assertThat(saveImage.configSchema())
                .extracting(WorkflowNodeConfigSchema::name)
                .contains("imagesVariable", "images");
        assertThat(saveImage.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("savedImageFiles", "savedImageFileIds", "savedImageUrls");

        WorkflowNodeCatalogItem human = item(result.getData(), "HUMAN");
        assertThat(human.exampleConfig())
                .containsEntry("methods", "webapp,telegram");

        WorkflowNodeCatalogItem summary = item(result.getData(), "SUMMARY");
        assertThat(summary.configSchema())
                .filteredOn(schema -> "prompt".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.ui()).isNull());

        WorkflowNodeCatalogItem condition = item(result.getData(), "CONDITION");
        assertThat(condition.configSchema())
                .filteredOn(schema -> "operator".equals(schema.name()))
                .singleElement()
                .satisfies(schema -> assertThat(schema.options()).contains("EQUALS", "NOT_EQUALS", "EXISTS"));
        assertThat(condition.outputVariables())
                .extracting(WorkflowNodeVariableSchema::name)
                .contains("matched", "branchKey");
    }

    private static WorkflowNodeCatalogItem item(List<WorkflowNodeCatalogItem> items, String type) {
        return items.stream()
                .filter(item -> type.equals(item.type()))
                .findFirst()
                .orElseThrow();
    }
}
