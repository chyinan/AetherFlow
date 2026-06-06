package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.ImageWorkflowDtos;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SaveImageNodeExecutor extends BaseNodeExecutor {

    private final ImageArtifactStorage storage;

    public SaveImageNodeExecutor(WorkflowNodeMetrics metrics, ImageArtifactStorage storage) {
        super(WorkflowNodeTypes.SAVE_IMAGE, metrics);
        this.storage = storage;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        List<ImageWorkflowDtos.GeneratedImage> images =
                ImageWorkflowNodeSupport.imagesFromConfigOrVariable(config, context);
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "save image node images are required");
        }
        Long userId = ImageWorkflowNodeSupport.userId(context);
        List<FileMetadataDTO> files = images.stream()
                .map(image -> storage.store(context.workflowId(), context.currentNodeId(), userId, image))
                .toList();
        Map<String, Object> variables = ImageWorkflowNodeSupport.storedImageResult(
                "savedImage",
                "saveImageMetadata",
                "",
                "save",
                Map.of("imageCount", files.size()),
                files
        );
        Map<String, Object> output = new LinkedHashMap<>(variables);
        output.put("imageFiles", variables.get("savedImageFiles"));
        return buildResult(output, variables);
    }
}
