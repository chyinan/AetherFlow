package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class LlmNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public LlmNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.LLM, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String prompt = prompt(config, context);
        if (prompt.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "llm node prompt is required");
        }
        Map<String, Object> payload = payload(config, prompt);
        AiWorkflowNodeResponseDTO response = executeAi(context, "LLM", payload);
        return aiResult(response, Map.of());
    }

    protected Map<String, Object> payload(Map<String, Object> config, String prompt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", prompt);
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));
        payload.put("temperature", NodeValueSupport.doubleValue(config.get("temperature"), 0.3D));
        int maxTokens = NodeValueSupport.intValue(config.get("maxTokens"), 0);
        if (maxTokens > 0) {
            payload.put("maxTokens", maxTokens);
        }
        payload.put("structuredOutput", NodeValueSupport.booleanValue(config.get("structuredOutput"), false));
        payload.put("reasoningTags", NodeValueSupport.booleanValue(config.get("reasoningTags"), false));
        return payload;
    }

    protected String prompt(Map<String, Object> config, WorkflowContext context) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(
                config, context, "prompt", "promptVariable", "prompt");
        if (value == null) {
            value = NodeValueSupport.valueFromConfigOrVariable(
                    config, context, "context", "contextVariable", "context");
        }
        if (value == null) {
            value = context.variables().get("question");
        }
        if (value == null) {
            value = context.variables().get("text");
        }
        return NodeValueSupport.stringValue(value);
    }
}
