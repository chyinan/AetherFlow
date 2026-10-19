package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.code.CodeExecutionRuntime;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;

@Component
public class CodeExecutionNodeExecutor extends BaseNodeExecutor {

    private final WorkflowNodeProperties properties;
    private final CodeExecutionRuntime runtime;

    @Autowired
    public CodeExecutionNodeExecutor(WorkflowNodeMetrics metrics, WorkflowNodeProperties properties, CodeExecutionRuntime runtime) {
        super(WorkflowNodeTypes.CODE, metrics);
        this.properties = properties;
        this.runtime = runtime;
    }

    public CodeExecutionNodeExecutor(WorkflowNodeMetrics metrics, WorkflowNodeProperties properties) {
        this(metrics, properties, CodeExecutionRuntime.unavailable());
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        if (!properties.isCodeExecutionEnabled()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "code execution is disabled");
        }
        if (!properties.isCodeRuntimeIsolationConfirmed()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "code execution is unavailable; configure and confirm an isolated code runtime before enabling this node");
        }
        if (config.containsKey("customDefinition")) return executeCustom(context, config);
        String code = NodeValueSupport.stringValue(config.get("code"), "").trim();
        if (code.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "code execution requires code");
        }
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "codeResult");
        Object input = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", "payload");
        CodeExecutionRuntime.CodeExecutionResult execution = runtime.execute(
                NodeValueSupport.stringValue(config.get("language"), "python3"),
                code,
                input,
                Math.max(50, Math.min(properties.getCodeTimeoutMs(), NodeValueSupport.intValue(config.get("timeoutMs"), properties.getCodeTimeoutMs()))),
                Math.max(1_024, Math.min(properties.getCodeMaxOutputBytes(), NodeValueSupport.intValue(config.get("maxOutputBytes"), properties.getCodeMaxOutputBytes())))
        );
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("language", NodeValueSupport.stringValue(config.get("language"), "python3"));
        output.put("result", execution.result());
        output.put("stdout", execution.stdout());
        output.put("durationMs", execution.durationMs());
        output.put("truncated", execution.truncated());
        output.put("executed", true);
        return buildResult(output, Map.of(outputVariable, execution.result()));
    }

    private NodeResult executeCustom(WorkflowContext context, Map<String, Object> config) {
        try {
            var prepared = com.aetherflow.workflow.node.custom.CustomNodeDefinition.prepare("CODE", config, context.variables());
            var definition = prepared.definition();
            if (Thread.currentThread().isInterrupted()) throw new IllegalArgumentException("自定义代码请求已取消");
            var execution = runtime.execute("python3", definition.code(), Map.of("inputs", prepared.inputs(), "config", prepared.values()),
                    Math.max(50, Math.min(properties.getCodeTimeoutMs(), NodeValueSupport.intValue(config.get("timeoutMs"), properties.getCodeTimeoutMs()))),
                    Math.max(1024, Math.min(properties.getCodeMaxOutputBytes(), NodeValueSupport.intValue(config.get("maxOutputBytes"), properties.getCodeMaxOutputBytes()))));
            if (Thread.currentThread().isInterrupted()) throw new IllegalArgumentException("自定义代码请求已取消");
            Map<String, Object> outputs = definition.mapOutputs(execution.result());
            return buildResult(Map.of("templateId", definition.id, "templateVersion", definition.version, "result", outputs,
                    "stdout", execution.stdout(), "durationMs", execution.durationMs(), "truncated", execution.truncated()), outputs);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, exception.getMessage());
        }
    }
}
