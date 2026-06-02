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
public class TranslateWorkflowNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public TranslateWorkflowNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.TRANSLATE, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(
                config, context, "text", "textVariable", "transcription");
        if (value == null) {
            value = NodeValueSupport.valueFromConfigOrVariable(
                    config, context, "source", "sourceVariable", "summary");
        }
        String text = NodeValueSupport.stringValue(value);
        if (text.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "translate node text is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("text", text);
        payload.put("sourceLanguage", NodeValueSupport.stringValue(config.get("sourceLanguage"), "auto"));
        payload.put("targetLanguage", NodeValueSupport.stringValue(config.get("targetLanguage"), "English"));
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));
        NodeValueSupport.putIfPresent(payload, "promptVersion", config.get("promptVersion"));

        AiWorkflowNodeResponseDTO response = executeAi(context, "TRANSLATE", payload);
        Map<String, Object> variables = new LinkedHashMap<>();
        if (response.getOutput() != null && response.getOutput().get("translatedText") != null) {
            variables.put("translation", response.getOutput().get("translatedText"));
        }
        return aiResult(response, variables);
    }
}
