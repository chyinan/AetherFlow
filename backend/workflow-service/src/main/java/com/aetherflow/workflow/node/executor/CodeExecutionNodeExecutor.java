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
public class CodeExecutionNodeExecutor extends BaseNodeExecutor {

    private final WorkflowNodeProperties properties;

    public CodeExecutionNodeExecutor(WorkflowNodeMetrics metrics, WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.CODE, metrics);
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        if (!properties.isCodeExecutionEnabled()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "code execution is disabled; configure an isolated code runtime before enabling this node");
        }
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "codeResult");
        Object result = NodeValueSupport.valueFromConfigOrVariable(config, context, "result", "resultVariable", "");
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("language", NodeValueSupport.stringValue(config.get("language"), "text"));
        output.put("result", result == null ? "" : result);
        output.put("executed", false);
        output.put("message", "code runtime must be provided by an isolated executor");
        return buildResult(output, Map.of(outputVariable, output.get("result")));
    }
}
