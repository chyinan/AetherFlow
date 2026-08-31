package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell

import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class FfmpegWorkflowNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public FfmpegWorkflowNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.FFMPEG, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object fileUrl = NodeValueSupport.valueFromConfigOrVariable(
                config, context, "fileUrl", "fileUrlVariable", "fileUrl");
        if (fileUrl == null || String.valueOf(fileUrl).isBlank()) {
            throw new IllegalArgumentException("ffmpeg node fileUrl is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fileUrl", String.valueOf(fileUrl));
        payload.put("operation", NodeValueSupport.stringValue(config.get("operation"), "extract-audio"));
        payload.put("outputFormat", NodeValueSupport.stringValue(config.get("outputFormat"), "wav"));
        payload.put("timeoutSeconds", Math.max(1, Math.min(1800,
                NodeValueSupport.intValue(config.get("timeoutSeconds"), 120))));
        AiWorkflowNodeResponseDTO response = executeAi(context, "FFMPEG", payload);
        return aiResult(response);
    }
}
