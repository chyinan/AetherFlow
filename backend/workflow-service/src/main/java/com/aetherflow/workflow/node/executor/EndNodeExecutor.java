package com.aetherflow.workflow.node.executor;

// pattern: Functional Core

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class EndNodeExecutor extends BaseNodeExecutor {

    public EndNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.END, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Map<String, Object> configuredOutput = asMap(config.get("output"));
        Map<String, Object> resolvedOutput = new LinkedHashMap<>();
        if (configuredOutput.isEmpty()) {
            context.variables().forEach((key, value) -> {
                if (!WorkflowNodeContextKeys.NODE_CONFIGS.equals(key) && value != null) {
                    resolvedOutput.put(key, value);
                }
            });
        } else {
            configuredOutput.forEach((key, value) -> {
                if (value instanceof String variableName && context.variables().containsKey(variableName)) {
                    resolvedOutput.put(key, context.variables().get(variableName));
                } else {
                    resolvedOutput.put(key, value);
                }
            });
        }
        return buildResult(resolvedOutput, asMap(config.get("variables")));
    }
}
