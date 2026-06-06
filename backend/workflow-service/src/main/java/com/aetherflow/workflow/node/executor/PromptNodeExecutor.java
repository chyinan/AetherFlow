package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PromptNodeExecutor extends BaseNodeExecutor {

    public PromptNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.PROMPT, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String prompt = NodeValueSupport.stringValue(config.get("prompt"));
        String negativePrompt = NodeValueSupport.stringValue(config.get("negativePrompt"));
        Map<String, Object> metadata = new LinkedHashMap<>();
        NodeValueSupport.putIfPresent(metadata, "stylePreset", config.get("stylePreset"));
        NodeValueSupport.putIfPresent(metadata, "promptVersion", config.get("promptVersion"));
        NodeValueSupport.putIfPresent(metadata, "tags", config.get("tags"));

        Map<String, Object> output = new LinkedHashMap<>();
        output.put("prompt", prompt);
        output.put("negativePrompt", negativePrompt);
        output.put("promptMetadata", metadata);

        Map<String, Object> variables = new LinkedHashMap<>(output);
        return buildResult(output, variables);
    }
}
