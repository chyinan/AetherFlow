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
public class WhisperNodeExecutor extends BaseNodeExecutor {

    private final AiWorkflowNodeClient aiClient;
    private final WorkflowNodeProperties properties;

    public WhisperNodeExecutor(WorkflowNodeMetrics metrics,
                               AiWorkflowNodeClient aiClient,
                               WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.WHISPER, metrics);
        this.aiClient = aiClient;
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String fileUrl = fileUrl(context, config);
        if (fileUrl.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "whisper node fileUrl is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fileUrl", fileUrl);
        payload.put("language", stringValue(config.getOrDefault("language", properties.getDefaultWhisperLanguage())));
        payload.put("prompt", stringValue(config.getOrDefault("prompt", "")));
        AiWorkflowNodeResponseDTO response = executeAi(context, "WHISPER", payload);
        Map<String, Object> output = safeOutput(response);
        Map<String, Object> variables = new LinkedHashMap<>();
        Object text = output.get("text");
        if (text != null) {
            variables.put("transcription", text);
        }
        copyIfPresent(output, variables, "srtObjectKey");
        copyIfPresent(output, variables, "durationSeconds");
        return buildResult(output, variables);
    }

    private String fileUrl(WorkflowContext context, Map<String, Object> config) {
        String configured = stringValue(config.get("fileUrl"));
        if (!configured.isBlank()) {
            return configured;
        }
        String variableName = stringValue(config.getOrDefault("fileUrlVariable", "fileUrl"));
        return stringValue(context.variables().get(variableName));
    }

    private AiWorkflowNodeResponseDTO executeAi(WorkflowContext context, String nodeType, Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = request(context, nodeType, payload);
        Result<AiWorkflowNodeResponseDTO> result = aiClient.execute(request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ai workflow node execution failed");
        }
        return result.getData();
    }

    private AiWorkflowNodeRequestDTO request(WorkflowContext context, String nodeType, Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId(context.workflowId());
        request.setTraceId(context.traceId());
        request.setTaskId(context.taskId());
        request.setNodeId(context.currentNodeId());
        request.setNodeType(nodeType);
        request.setPayload(payload);
        return request;
    }

    private Map<String, Object> safeOutput(AiWorkflowNodeResponseDTO response) {
        return response.getOutput() == null ? Map.of() : response.getOutput();
    }

    private void copyIfPresent(Map<String, Object> source, Map<String, Object> target, String key) {
        if (source.containsKey(key) && source.get(key) != null) {
            target.put(key, source.get(key));
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
