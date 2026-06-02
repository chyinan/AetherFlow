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
public class AgentNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    public AgentNodeExecutor(WorkflowNodeMetrics metrics, AiWorkflowNodeClient aiClient) {
        super(WorkflowNodeTypes.AGENT, metrics, aiClient);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object taskValue = NodeValueSupport.valueFromConfigOrVariable(config, context, "task", "taskVariable", "task");
        if (taskValue == null) {
            taskValue = context.variables().get("question");
        }
        String task = NodeValueSupport.stringValue(taskValue);
        if (task.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "agent node task is required");
        }
        String strategy = NodeValueSupport.stringValue(config.get("strategy"), "plan");
        String prompt = "Create an execution plan for this task. Strategy: " + strategy + "\nTask: " + task;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("prompt", prompt);
        payload.put("temperature", NodeValueSupport.doubleValue(config.get("temperature"), 0.2D));
        payload.put("structuredOutput", true);
        NodeValueSupport.putIfPresent(payload, "provider", config.get("provider"));
        NodeValueSupport.putIfPresent(payload, "model", config.get("model"));

        AiWorkflowNodeResponseDTO response = executeAi(context, "LLM", payload);
        Map<String, Object> variables = new LinkedHashMap<>();
        if (response.getOutput() != null) {
            Object plan = response.getOutput().getOrDefault("jsonData", response.getOutput().get("completionText"));
            variables.put("plan", plan);
            variables.put("actionLog", response.getOutput().get("completionText"));
        }
        return aiResult(response, variables);
    }
}
