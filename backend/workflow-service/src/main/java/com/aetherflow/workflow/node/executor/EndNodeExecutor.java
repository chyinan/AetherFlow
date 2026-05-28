package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class EndNodeExecutor extends BaseNodeExecutor {

    public EndNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.END, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        return buildResult(asMap(config.get("output")), asMap(config.get("variables")));
    }
}
