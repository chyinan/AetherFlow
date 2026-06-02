package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class QuestionUnderstandNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public QuestionUnderstandNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.QUESTION_UNDERSTAND, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String question = input(config, context, "question");
        if (question.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "question understand node input is required");
        }
        String prompt = "Normalize the user question into intent, entities, and language. Return concise JSON.\nQuestion: " + question;
        AiWorkflowNodeResponseDTO response = executeAi(context, "LLM", llmPayload(config, prompt));
        Map<String, Object> variables = new LinkedHashMap<>();
        if (response.getOutput() != null) {
            Object intent = response.getOutput().getOrDefault("jsonData", response.getOutput().get("completionText"));
            variables.put("intent", intent);
            variables.put("intentJson", intent);
        }
        return aiResult(response, variables);
    }

    private String input(Map<String, Object> config, WorkflowContext context, String defaultVariable) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", defaultVariable);
        return NodeValueSupport.stringValue(value);
    }

    private Map<String, Object> llmPayload(Map<String, Object> config, String prompt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", prompt);
        payload.put("temperature", NodeValueSupport.doubleValue(config.get("temperature"), 0.1D));
        payload.put("structuredOutput", true);
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));
        return payload;
    }
}
