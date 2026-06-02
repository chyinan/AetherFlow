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
public class ParameterExtractorNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public ParameterExtractorNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.PARAMETER_EXTRACTOR, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", "text");
        String text = NodeValueSupport.stringValue(value);
        if (text.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "parameter extractor node input is required");
        }
        String instruction = NodeValueSupport.stringValue(config.get("instruction"), "Extract named parameters from the text.");
        String prompt = instruction + " Return JSON only.\nText: " + text;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", prompt);
        payload.put("temperature", NodeValueSupport.doubleValue(config.get("temperature"), 0.0D));
        payload.put("structuredOutput", true);
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));

        AiWorkflowNodeResponseDTO response = executeAi(context, "LLM", payload);
        Map<String, Object> params = response.getOutput() == null
                ? Map.of()
                : NodeValueSupport.objectMap(response.getOutput().get("jsonData"));
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("params", params);
        variables.put("paramsJson", params);
        return aiResult(response, variables);
    }
}
