package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class VariableAggregateNodeExecutor extends BaseNodeExecutor {

    public VariableAggregateNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.VARIABLE_AGGREGATE, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        List<String> variableNames = NodeValueSupport.stringList(config.get("variables"));
        if (variableNames.isEmpty()) {
            variableNames = NodeValueSupport.stringList(config.get("variable"));
        }
        Map<String, Object> merged = new LinkedHashMap<>();
        for (String variableName : variableNames) {
            if (context.variables().containsKey(variableName)) {
                merged.put(variableName, context.variables().get(variableName));
            }
        }
        if (merged.isEmpty() && config.get("value") != null) {
            merged.put("value", config.get("value"));
        }
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "merged");
        Map<String, Object> output = Map.of("merged", merged, "count", merged.size());
        return buildResult(output, Map.of(outputVariable, merged));
    }
}
