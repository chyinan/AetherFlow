package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.mapping.StructuredDataMapper;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class TemplateTransformNodeExecutor extends BaseNodeExecutor {

    public TemplateTransformNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.TEMPLATE_TRANSFORM, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        if ("structured".equals(config.get("transformMode"))) {
            try {
                Object mapped = StructuredDataMapper.transform(context.variables(), config.get("mapping"));
                String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "mappedValue");
                return buildResult(Map.of("mappedValue", mapped), Map.of(outputVariable, mapped));
            } catch (IllegalArgumentException exception) {
                throw new BusinessException(ResultCode.BAD_REQUEST, exception.getMessage());
            }
        }
        String template = NodeValueSupport.stringValue(config.get("template"));
        Map<String, Object> variables = new LinkedHashMap<>(context.variables());
        variables.putAll(NodeValueSupport.objectMap(config.get("variables")));
        String rendered = NodeValueSupport.renderTemplate(template, variables);
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "renderedText");
        Map<String, Object> output = Map.of("renderedText", rendered);
        return buildResult(output, Map.of(outputVariable, rendered));
    }
}
