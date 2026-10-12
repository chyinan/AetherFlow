package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.subworkflow.SubworkflowService;
import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class SubworkflowNodeExecutor extends BaseNodeExecutor {
    private final SubworkflowService subworkflows;
    public SubworkflowNodeExecutor(WorkflowNodeMetrics metrics, SubworkflowService subworkflows) {
        super(WorkflowNodeTypes.SUBWORKFLOW, metrics);
        this.subworkflows = subworkflows;
    }
    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        return subworkflows.invoke(context, config);
    }
}
