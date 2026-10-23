package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.LinkedHashMap;

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
        Object value;
        String valueMode = NodeValueSupport.stringValue(config.get("valueMode"), "").trim();
        if ("SOURCE_VARIABLE".equalsIgnoreCase(valueMode)) {
            String sourceVariable = NodeValueSupport.stringValue(config.get("sourceVariable")).trim();
            if (sourceVariable.isBlank()) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                        "variable assigner node sourceVariable is required in SOURCE_VARIABLE mode");
            }
            value = context.variables().get(sourceVariable);
        } else if ("LITERAL".equalsIgnoreCase(valueMode)) {
            if (!config.containsKey("value")) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                        "variable assigner node value is required in LITERAL mode");
            }
            value = config.get("value");
        } else {
            // 旧配置仍以非空 value 优先，并在空值时读取 sourceVariable。
            value = NodeValueSupport.valueFromConfigOrVariable(config, context, "value", "sourceVariable", "");
            if (value == null) value = "";
        }
        Map<String, Object> assigned = new LinkedHashMap<>();
        assigned.put(variable, value);
        return buildResult(assigned, assigned);
    }
}
