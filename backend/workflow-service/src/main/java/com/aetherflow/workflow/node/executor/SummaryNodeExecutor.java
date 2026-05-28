package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class SummaryNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;
    private final WorkflowNodeProperties properties;

    public SummaryNodeExecutor(WorkflowNodeMetrics metrics,
                               AiWorkflowNodeClient aiClient,
                               WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.SUMMARY, metrics);
        this.aiClient = aiClient;
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String text = firstText(config, context);
        if (text.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "summary node text is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", text);
        payload.put("language", stringValue(config.getOrDefault("language", properties.getDefaultSummaryLanguage())));
        payload.put("prompt", stringValue(config.getOrDefault("prompt", "")));
        putIfPresent(payload, "provider", config.get("provider"));
        putIfPresent(payload, "model", config.get("model"));
        putIfPresent(payload, "promptVersion", config.get("promptVersion"));
        AiWorkflowNodeResponseDTO response = executeAi(context, payload);
        Map<String, Object> output = response.getOutput() == null ? Map.of() : response.getOutput();
        Map<String, Object> variables = new LinkedHashMap<>();
        if (output.get("summary") != null) {
            variables.put("summary", output.get("summary"));
        }
        return buildResult(output, variables);
    }

    private AiWorkflowNodeResponseDTO executeAi(WorkflowContext context, Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType("SUMMARY");
        request.setPayload(payload);
        Result<AiWorkflowNodeResponseDTO> result = aiClient.execute(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "summary node ai execution failed");
        }
        return result.getData();
    }

    private String firstText(Map<String, Object> config, WorkflowContext context) {
        Object value = config.get("text");
        if (value == null && config.get("textVariable") != null) {
            value = context.variables().get(stringValue(config.get("textVariable")));
        }
        if (value == null) {
            value = context.variables().get("summaryInput");
        }
        if (value == null) {
            value = context.variables().get("transcription");
        }
        if (value == null) {
            value = context.variables().get("text");
        }
        return stringValue(value);
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null && !String.valueOf(value).isBlank()) {
            target.put(key, value);
        }
    }
}
