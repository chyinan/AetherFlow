package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class StartNodeExecutor extends BaseNodeExecutor {

    public StartNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.START, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Map<String, Object> variables = new LinkedHashMap<>(asMap(config.get("variables")));
        // Invocation input must win over stale design-time defaults such as an old fileId.
        variables.putAll(context.variables());
        variables.remove(WorkflowNodeContextKeys.NODE_CONFIGS);
        return buildResult(asMap(config.get("output")), variables);
    }
}
