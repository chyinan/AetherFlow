package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 异步图像节点结果的副作用适配器：复用同步节点的对象存储与文件元数据登记逻辑。
 */
@Component
// pattern: Imperative Shell
public class DefaultImageWorkflowNodeResultFinisher implements ImageWorkflowNodeResultFinisher {

    private static final int MAX_IMAGES_PER_RESULT = 8;
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
        List<ImageWorkflowDtos.GeneratedImage> images = ImageWorkflowNodeSupport.imagesFromOutput(output);
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "async image result returned no images");
        }
        DefaultWorkflowContext snapshotContext = new DefaultWorkflowContext(
                workflowId, workflowId, workflowId, variables);
        Long userId = ImageWorkflowNodeSupport.userId(snapshotContext);
        List<FileMetadataDTO> files = images.stream()
                .limit(MAX_IMAGES_PER_RESULT)
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

    private String stringValue(Map<String, Object> output, String key) {
        Object value = output == null ? null : output.get(key);
        return value == null ? "" : String.valueOf(value);
    }

}
