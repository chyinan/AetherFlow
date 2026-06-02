package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class HumanInterventionNodeExecutor extends BaseNodeExecutor {

    private final WorkflowNodeProperties properties;

    public HumanInterventionNodeExecutor(WorkflowNodeMetrics metrics, WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.HUMAN, metrics);
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        boolean autoApprove = NodeValueSupport.booleanValue(config.get("autoApprove"), properties.isHumanAutoApproveEnabled());
        if (!autoApprove) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "human intervention requires explicit approval workflow support or autoApprove=true");
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("approved", true);
        output.put("reviewer", NodeValueSupport.stringValue(config.get("reviewer"), "auto"));
        output.put("method", NodeValueSupport.stringValue(config.get("methods"), "auto"));
        return buildResult(output, Map.of("approved", true, "approval", output));
    }
}
