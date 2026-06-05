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
import java.util.List;
import java.util.Map;

@Component
public class QuestionClassifierNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public QuestionClassifierNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.QUESTION_CLASSIFIER, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", "question");
        String question = NodeValueSupport.stringValue(value);
        if (question.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "question classifier node input is required");
        }
        List<String> routes = routes(config);
        String prompt = "Classify the question into exactly one route. Return JSON with route and confidence.\nRoutes: "
                + String.join(", ", routes) + "\nQuestion: " + question;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", prompt);
        payload.put("temperature", NodeValueSupport.doubleValue(config.get("temperature"), 0.0D));
        payload.put("structuredOutput", true);
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));

        AiWorkflowNodeResponseDTO response = executeAi(context, "LLM", payload);
        Map<String, Object> routeJson = routeJson(response);
        Object route = routeJson.getOrDefault("route", response.getOutput() == null ? "" : response.getOutput().get("completionText"));
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("route", route);
        variables.put("routeJson", routeJson.isEmpty() ? Map.of("route", route) : routeJson);
        return aiResult(response, variables)
                .withBranchKey(NodeValueSupport.stringValue(route));
    }

    private List<String> routes(Map<String, Object> config) {
        List<String> configured = NodeValueSupport.stringList(config.get("routes"));
        if (!configured.isEmpty()) {
            return configured;
        }
        return List.of(
                NodeValueSupport.stringValue(config.get("class1"), "CLASS 1"),
                NodeValueSupport.stringValue(config.get("class2"), "CLASS 2")
        );
    }

    private Map<String, Object> routeJson(AiWorkflowNodeResponseDTO response) {
        if (response.getOutput() == null) {
            return Map.of();
        }
        return NodeValueSupport.objectMap(response.getOutput().get("jsonData"));
    }
}
