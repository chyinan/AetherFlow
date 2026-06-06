package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.WorkflowContext;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class ImageWorkflowNodeSupport {

    private ImageWorkflowNodeSupport() {
    }

    static Map<String, Object> imageGenerationPayload(Map<String, Object> config, WorkflowContext context) {
        Map<String, Object> payload = new LinkedHashMap<>();
        putResolved(payload, "prompt", config, context, "prompt", "promptVariable", "prompt");
        putResolved(payload, "negativePrompt", config, context, "negativePrompt", "negativePromptVariable", "negativePrompt");
        putResolved(payload, "sourceImage", config, context, "sourceImage", "sourceImageVariable", "sourceImage");
        copyGenerationConfig(payload, config);
        return payload;
    }

    static Map<String, Object> upscalePayload(Map<String, Object> config, WorkflowContext context) {
        Map<String, Object> payload = new LinkedHashMap<>();
        putResolved(payload, "sourceImage", config, context, "sourceImage", "sourceImageVariable", "sourceImage");
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "upscaler", config.get("upscaler"));
        NodeValueSupport.putIfPresent(payload, "workflow", config.get("workflow"));
        NodeValueSupport.putIfPresent(payload, "workflowJson", config.get("workflowJson"));
        putPositiveNumber(payload, "scale", config.get("scale"), 2);
        putPositiveNumber(payload, "timeoutSeconds", config.get("timeoutSeconds"), 0);
        NodeValueSupport.putIfPresent(payload, "options", config.get("options"));
        return payload;
    }

    static List<ImageWorkflowDtos.GeneratedImage> imagesFromOutput(Map<String, Object> output) {
        return imagesFromValue(output.get("images"));
    }

    static List<ImageWorkflowDtos.GeneratedImage> imagesFromConfigOrVariable(Map<String, Object> config,
                                                                             WorkflowContext context) {
        Object value = config.get("images");
        if (value == null) {
            String variableName = NodeValueSupport.stringValue(config.get("imagesVariable"), "images");
            value = context.variables().get(variableName);
        }
        return imagesFromValue(value);
    }

    static Map<String, Object> storedImageResult(String filesKeyPrefix,
                                                 String metadataKey,
                                                 String provider,
                                                 String mode,
                                                 Map<String, Object> metadata,
                                                 List<FileMetadataDTO> files) {
        List<Map<String, Object>> fileMaps = files.stream()
                .map(ImageWorkflowNodeSupport::fileMap)
                .toList();
        List<Long> fileIds = files.stream()
                .map(FileMetadataDTO::getId)
                .filter(id -> id != null)
                .toList();
        List<String> urls = files.stream()
                .map(FileMetadataDTO::getUrl)
                .filter(url -> url != null && !url.isBlank())
                .toList();
        List<String> objectKeys = files.stream()
                .map(FileMetadataDTO::getObjectKey)
                .filter(objectKey -> objectKey != null && !objectKey.isBlank())
                .toList();

        Map<String, Object> variables = new LinkedHashMap<>();
        NodeValueSupport.putIfPresent(variables, "provider", provider);
        NodeValueSupport.putIfPresent(variables, "mode", mode);
        variables.put(filesKeyPrefix + "Files", fileMaps);
        variables.put(filesKeyPrefix + "FileIds", fileIds);
        variables.put(filesKeyPrefix + "Urls", urls);
        variables.put(filesKeyPrefix + "ObjectKeys", objectKeys);
        variables.put(metadataKey, metadata == null ? Map.of() : Map.copyOf(metadata));
        return variables;
    }

    static Map<String, Object> fileMap(FileMetadataDTO file) {
        Map<String, Object> map = new LinkedHashMap<>();
        putIfPresent(map, "id", file.getId());
        putIfPresent(map, "bucket", file.getBucket());
        putIfPresent(map, "objectKey", file.getObjectKey());
        putIfPresent(map, "originalName", file.getOriginalName());
        putIfPresent(map, "contentType", file.getContentType());
        putIfPresent(map, "size", file.getSize());
        putIfPresent(map, "url", file.getUrl());
        return map;
    }

    static Long userId(WorkflowContext context) {
        Object value = context.variables().get("userId");
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static void copyGenerationConfig(Map<String, Object> payload, Map<String, Object> config) {
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "mode", config.get("mode"));
        putLong(payload, "seed", config.get("seed"));
        putPositiveNumber(payload, "steps", config.get("steps"), 0);
        putPositiveDouble(payload, "cfgScale", config.get("cfgScale"), 0);
        NodeValueSupport.putIfPresent(payload, "sampler", config.get("sampler"));
        NodeValueSupport.putIfPresent(payload, "scheduler", config.get("scheduler"));
        putPositiveNumber(payload, "width", config.get("width"), 0);
        putPositiveNumber(payload, "height", config.get("height"), 0);
        putPositiveNumber(payload, "batchSize", config.get("batchSize"), 0);
        putPositiveDouble(payload, "denoiseStrength", config.get("denoiseStrength"), -1);
        NodeValueSupport.putIfPresent(payload, "checkpoint", config.get("checkpoint"));
        NodeValueSupport.putIfPresent(payload, "vae", config.get("vae"));
        NodeValueSupport.putIfPresent(payload, "lora", config.get("lora"));
        NodeValueSupport.putIfPresent(payload, "workflow", config.get("workflow"));
        NodeValueSupport.putIfPresent(payload, "workflowJson", config.get("workflowJson"));
        NodeValueSupport.putIfPresent(payload, "sourceImageName", config.get("sourceImageName"));
        putPositiveNumber(payload, "timeoutSeconds", config.get("timeoutSeconds"), 0);
        NodeValueSupport.putIfPresent(payload, "options", config.get("options"));
    }

    private static void putResolved(Map<String, Object> payload,
                                    String payloadKey,
                                    Map<String, Object> config,
                                    WorkflowContext context,
                                    String configKey,
                                    String variableKey,
                                    String defaultVariable) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, configKey, variableKey, defaultVariable);
        NodeValueSupport.putIfPresent(payload, payloadKey, value);
    }

    private static List<ImageWorkflowDtos.GeneratedImage> imagesFromValue(Object value) {
        if (value == null) {
            return List.of();
        }
        List<ImageWorkflowDtos.GeneratedImage> images = new ArrayList<>();
        if (value instanceof Collection<?> collection) {
            for (Object item : collection) {
                images.add(image(item));
            }
            return List.copyOf(images);
        }
        images.add(image(value));
        return List.copyOf(images);
    }

    private static ImageWorkflowDtos.GeneratedImage image(Object value) {
        if (value instanceof ImageWorkflowDtos.GeneratedImage generatedImage) {
            return generatedImage;
        }
        if (value instanceof String base64) {
            return new ImageWorkflowDtos.GeneratedImage("image.png", "image/png", base64, null, Map.of());
        }
        if (!(value instanceof Map<?, ?> source)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "image payload must be an object, string or array");
        }
        Map<String, Object> map = new LinkedHashMap<>();
        source.forEach((key, item) -> map.put(String.valueOf(key), item));
        return new ImageWorkflowDtos.GeneratedImage(
                NodeValueSupport.stringValue(map.get("fileName"), "image.png"),
                NodeValueSupport.stringValue(map.get("contentType"), "image/png"),
                NodeValueSupport.stringValue(map.get("base64Data")),
                longValue(map.get("size")),
                NodeValueSupport.objectMap(map.get("metadata"))
        );
    }

    private static void putLong(Map<String, Object> target, String key, Object value) {
        Long number = longValue(value);
        if (number != null) {
            target.put(key, number);
        }
    }

    private static void putPositiveNumber(Map<String, Object> target, String key, Object value, int fallback) {
        int number = NodeValueSupport.intValue(value, fallback);
        if (number > 0) {
            target.put(key, number);
        }
    }

    private static void putPositiveDouble(Map<String, Object> target, String key, Object value, double fallback) {
        double number = NodeValueSupport.doubleValue(value, fallback);
        if (number >= 0) {
            target.put(key, number);
        }
    }

    private static Long longValue(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null) {
            target.put(key, value);
        }
    }
}
