package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class IterationNodeExecutor extends BaseNodeExecutor {

    public IterationNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.ITERATION, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object input = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", "items");
        List<Object> items = NodeValueSupport.listValue(input);
        int maxIterations = Math.max(0, NodeValueSupport.intValue(config.get("maxIterations"), items.size()));
        List<Object> selected = items.stream().limit(maxIterations).toList();
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "iterationItems");
        Map<String, Object> output = Map.of(
                "items", selected,
                "count", selected.size(),
                "truncated", selected.size() < items.size()
        );
        return buildResult(output, Map.of(outputVariable, selected));
    }
}
