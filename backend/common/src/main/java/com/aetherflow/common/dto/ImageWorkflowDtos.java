package com.aetherflow.common.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Schema(description = "Shared DTOs for image workflow node inputs and outputs.")
public class ImageWorkflowDtos {

    private ImageWorkflowDtos() {
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "Generated image payload returned by image workflow nodes.")
    public static class GeneratedImage {

        @Schema(description = "Generated file name.", example = "image-1.png")
        private String fileName;

        @Schema(description = "Image content type.", example = "image/png")
        private String contentType;

        @Schema(description = "Base64 encoded image data.")
        private String base64Data;

        @Schema(description = "Image size in bytes.", example = "1048576")
        private Long size;

        @Schema(description = "Provider-specific image metadata.")
        private Map<String, Object> metadata;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "Image workflow node output payload.")
    public static class ImageNodeOutput {

        @Schema(description = "Image provider used for generation.", example = "OPENAI")
        private String provider;

        @Schema(description = "Image generation mode.", example = "text-to-image")
        private String mode;

        @Schema(description = "Generated images.")
        private List<GeneratedImage> images;

        @Schema(description = "Provider-specific output metadata.")
        private Map<String, Object> metadata;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Schema(description = "LoRA model configuration for image generation.")
    public static class LoraConfig {

        @Schema(description = "LoRA model name.", example = "product-style")
        private String name;

        @Schema(description = "LoRA model weight.", example = "0.8")
        private Double weight;
    }
}
