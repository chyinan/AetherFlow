package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class VariableAssignerNodeExecutor extends BaseNodeExecutor {

    public VariableAssignerNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.VARIABLE_ASSIGNER, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String variable = NodeValueSupport.stringValue(config.get("variable"));
        if (variable.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "variable assigner node variable is required");
        }
        Object value = NodeValueSupport.valueFromConfigOrVariable(config, context, "value", "sourceVariable", "");
        Map<String, Object> assigned = Map.of(variable, value == null ? "" : value);
        return buildResult(assigned, assigned);
    }
}
