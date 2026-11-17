package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * 异步图像节点结果的副作用适配器：复用同步节点的对象存储与文件元数据登记逻辑。
 */
@Component
// pattern: Imperative Shell
public class DefaultImageWorkflowNodeResultFinisher implements ImageWorkflowNodeResultFinisher {

    /** 与工作流节点目录的 batchSize 上限一致：1–16 张必须完整登记。 */
    private static final int MAX_IMAGES_PER_RESULT = 16;
    private final ImageArtifactStorage storage;

    public DefaultImageWorkflowNodeResultFinisher(ImageArtifactStorage storage) {
        this.storage = storage;
    }

    @Override
    public boolean supports(String nodeType) {
        return "IMAGE_GENERATION".equalsIgnoreCase(nodeType)
                || "UPSCALE".equalsIgnoreCase(nodeType)
                || "SAVE_IMAGE".equalsIgnoreCase(nodeType);
    }

    @Override
    public NodeResult finish(String nodeType,
                             String workflowId,
                             String nodeId,
                             Map<String, Object> variables,
                             Map<String, Object> output) {
        if (!supports(nodeType)) {
            throw new IllegalArgumentException("unsupported image node type: " + nodeType);
        }
        NodeResult alreadyStored = fromStoredArtifacts(nodeType, output);
        if (alreadyStored != null) {
            return alreadyStored;
        }
        List<ImageWorkflowDtos.GeneratedImage> images = ImageWorkflowNodeSupport.imagesFromOutput(output);
        if (images.isEmpty()) {
            NodeResult metadataOnly = successfulComfyMetadataOnly(nodeType, output);
            if (metadataOnly != null) {
                return metadataOnly;
            }
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "async image result returned no images");
        }
        if (images.size() > MAX_IMAGES_PER_RESULT) {
            // 超过支持上限的响应必须明确失败，不能静默丢弃多出来的图片。
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "async image result returned more images than the supported limit of " + MAX_IMAGES_PER_RESULT);
        }
        DefaultWorkflowContext snapshotContext = new DefaultWorkflowContext(
                workflowId, workflowId, workflowId, variables);
        Long userId = ImageWorkflowNodeSupport.userId(snapshotContext);
        List<FileMetadataDTO> files = images.stream()
                .map(image -> storage.store(workflowId, nodeId, userId, image))
                .toList();

        String normalized = nodeType == null ? "" : nodeType.trim().toUpperCase(Locale.ROOT);
        String prefix = switch (normalized) {
            case "UPSCALE" -> "upscaledImage";
            case "SAVE_IMAGE" -> "savedImage";
            default -> "image";
        };
        String metadataKey = switch (normalized) {
            case "UPSCALE" -> "upscaleMetadata";
            case "SAVE_IMAGE" -> "saveImageMetadata";
            default -> "imageGenerationMetadata";
        };
        Map<String, Object> stored = ImageWorkflowNodeSupport.storedImageResult(
                prefix,
                metadataKey,
                stringValue(output, "provider"),
                stringValue(output, "mode"),
                NodeValueSupport.objectMap(output == null ? null : output.get("metadata")),
                files);
        return NodeResult.success(stored, stored);
    }

    private NodeResult fromStoredArtifacts(String nodeType, Map<String, Object> output) {
        Object artifactFiles = output == null ? null : output.get("artifactFiles");
        if (!(artifactFiles instanceof List<?> files) || files.isEmpty()) {
            return null;
        }
        String normalized = nodeType == null ? "" : nodeType.trim().toUpperCase(Locale.ROOT);
        String prefix = switch (normalized) {
            case "UPSCALE" -> "upscaledImage";
            case "SAVE_IMAGE" -> "savedImage";
            default -> "image";
        };
        String metadataKey = switch (normalized) {
            case "UPSCALE" -> "upscaleMetadata";
            case "SAVE_IMAGE" -> "saveImageMetadata";
            default -> "imageGenerationMetadata";
        };
        Map<String, Object> stored = new LinkedHashMap<>();
        stored.put("provider", stringValue(output, "provider"));
        stored.put("mode", stringValue(output, "mode"));
        stored.put(metadataKey, NodeValueSupport.objectMap(output.get("metadata")));
        List<?> imageFiles = artifactFilesOfType(files, output.get("artifactTypeBindings"), "image");
        List<?> mediaFiles = artifactFilesOfType(files, output.get("artifactTypeBindings"), "media");
        stored.put(prefix + "Files", imageFiles);
        stored.put(prefix + "FileIds", valueOrEmptyList(output.get("imageFileIds")));
        stored.put(prefix + "ObjectKeys", valueOrEmptyList(output.get("imageObjectKeys")));
        stored.put(prefix + "Urls", valueOrEmptyList(output.get("imageUrls")));
        if (!mediaFiles.isEmpty()) {
            stored.put("mediaFiles", mediaFiles);
            stored.put("mediaFileIds", valueOrEmptyList(output.get("mediaFileIds")));
            stored.put("mediaObjectKeys", valueOrEmptyList(output.get("mediaObjectKeys")));
            stored.put("mediaUrls", valueOrEmptyList(output.get("mediaUrls")));
            copyIfPresent(output, stored, "mediaFileId");
            copyIfPresent(output, stored, "mediaObjectKey");
            copyIfPresent(output, stored, "mediaUrl");
            copyIfPresent(output, stored, "fileId");
            copyIfPresent(output, stored, "fileObjectKey");
            copyIfPresent(output, stored, "fileUrl");
            if (stored.containsKey("mediaUrl")) {
                stored.putIfAbsent("fileUrl", stored.get("mediaUrl"));
            }
        }
        return NodeResult.success(Map.copyOf(stored), Map.copyOf(stored));
    }

    private List<?> artifactFilesOfType(List<?> files, Object rawBindings, String expectedType) {
        if (!(rawBindings instanceof List<?> bindings) || bindings.isEmpty()) {
            return "image".equals(expectedType) ? List.copyOf(files) : List.of();
        }
        java.util.ArrayList<Object> typedFiles = new java.util.ArrayList<>();
        for (Object rawBinding : bindings) {
            if (!(rawBinding instanceof Map<?, ?> binding)
                    || !(binding.get("index") instanceof Number indexValue)
                    || !expectedType.equalsIgnoreCase(String.valueOf(binding.get("type")))) {
                continue;
            }
            int index = indexValue.intValue();
            if (index >= 0 && index < files.size()) {
                typedFiles.add(files.get(index));
            }
        }
        return List.copyOf(typedFiles);
    }

    private NodeResult successfulComfyMetadataOnly(String nodeType, Map<String, Object> output) {
        if (!"IMAGE_GENERATION".equalsIgnoreCase(nodeType)
                || !"COMFYUI".equalsIgnoreCase(stringValue(output, "provider"))
                || !"workflow".equalsIgnoreCase(stringValue(output, "mode"))) {
            return null;
        }
        Map<String, Object> metadata = NodeValueSupport.objectMap(output == null ? null : output.get("metadata"));
        Map<String, Object> comfyMetadata = NodeValueSupport.objectMap(metadata.get("comfyOutputMetadata"));
        if (!"success".equalsIgnoreCase(stringValue(comfyMetadata, "terminalStatus"))
                || NodeValueSupport.objectMap(comfyMetadata.get("outputs")).isEmpty()) {
            return null;
        }
        Map<String, Object> stored = new LinkedHashMap<>();
        stored.put("provider", stringValue(output, "provider"));
        stored.put("mode", stringValue(output, "mode"));
        stored.put("imageGenerationMetadata", metadata);
        stored.put("imageFiles", List.of());
        stored.put("imageFileIds", List.of());
        stored.put("imageObjectKeys", List.of());
        stored.put("imageUrls", List.of());
        stored.put("mediaFiles", List.of());
        stored.put("mediaFileIds", List.of());
        stored.put("mediaObjectKeys", List.of());
        stored.put("mediaUrls", List.of());
        return NodeResult.success(Map.copyOf(stored), Map.copyOf(stored));
    }

    private void copyIfPresent(Map<String, Object> source, Map<String, Object> target, String key) {
        if (source != null && source.get(key) != null) {
            target.put(key, source.get(key));
        }
    }

    private List<?> valueOrEmptyList(Object value) {
        return value instanceof List<?> list ? List.copyOf(list) : List.of();
    }

    private String stringValue(Map<String, Object> output, String key) {
        Object value = output == null ? null : output.get(key);
        return value == null ? "" : String.valueOf(value);
    }

}
