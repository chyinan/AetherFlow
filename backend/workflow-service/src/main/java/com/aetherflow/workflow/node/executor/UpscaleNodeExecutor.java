package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class UpscaleNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    private final ImageArtifactStorage storage;

    public UpscaleNodeExecutor(WorkflowNodeMetrics metrics,
                               AiWorkflowNodeClient aiClient,
                               ImageArtifactStorage storage) {
        super(WorkflowNodeTypes.UPSCALE, metrics, aiClient);
        this.storage = storage;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        AiWorkflowNodeResponseDTO response = executeAi(context, "UPSCALE",
                ImageWorkflowNodeSupport.upscalePayload(config, context));
        Map<String, Object> aiOutput = response.getOutput() == null ? Map.of() : response.getOutput();
        List<ImageWorkflowDtos.GeneratedImage> images = ImageWorkflowNodeSupport.imagesFromOutput(aiOutput);
        if (images.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "upscale node returned no images");
        }
        Long userId = ImageWorkflowNodeSupport.userId(context);
        List<FileMetadataDTO> files = images.stream()
                .map(image -> storage.store(context.workflowId(), context.currentNodeId(), userId, image))
                .toList();
        Map<String, Object> variables = ImageWorkflowNodeSupport.storedImageResult(
                "upscaledImage",
                "upscaleMetadata",
                NodeValueSupport.stringValue(aiOutput.get("provider")),
                NodeValueSupport.stringValue(aiOutput.get("mode"), "upscale"),
                NodeValueSupport.objectMap(aiOutput.get("metadata")),
                files
        );
        Map<String, Object> output = new LinkedHashMap<>(variables);
        output.put("imageFiles", variables.get("upscaledImageFiles"));
        return buildResult(output, variables);
    }
}
