package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class PromptAiNodeExecutor implements AiNodeExecutor {

    @Override
    public String nodeType() {
        return "PROMPT";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("prompt", context.payloadString("prompt", ""));
        output.put("negativePrompt", context.payloadString("negativePrompt", ""));
        output.put("metadata", Map.of("source", "PROMPT"));
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }
}
