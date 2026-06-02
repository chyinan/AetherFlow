package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class LlmNodeExecutor implements AiNodeExecutor {

    private final AiProviderRouter providerRouter;
    private final AiTaskProperties properties;

    public LlmNodeExecutor(AiProviderRouter providerRouter, AiTaskProperties properties) {
        this.providerRouter = providerRouter;
        this.properties = properties;
    }

    @Override
    public String nodeType() {
        return "LLM";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("temperature", doublePayload(context, "temperature", 0.3D));
        int maxTokens = intPayload(context, "maxTokens", 0);
        if (maxTokens > 0) {
            options.put("maxTokens", maxTokens);
        }
        options.put("structuredOutput", booleanPayload(context, "structuredOutput", false));
        options.put("reasoningTags", booleanPayload(context, "reasoningTags", false));

        AiProviderResponse response = providerRouter.complete(new AiProviderRequest(
                AiProviderType.from(context.payloadString("provider", ""), null),
                context.payloadString("model", properties.getDefaultModel()),
                context.payloadString("prompt"),
                options,
                properties.getProviderTimeout()
        ));
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("completionText", response.text());
        output.put("provider", response.provider().name());
        output.put("model", response.model());
        output.put("metadata", response.metadata() == null ? Map.of() : response.metadata());
        if (Boolean.TRUE.equals(options.get("structuredOutput"))) {
            output.put("jsonData", response.metadata() == null ? Map.of() : response.metadata().getOrDefault("jsonData", Map.of()));
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }

    private boolean booleanPayload(AiNodeExecutionContext context, String key, boolean fallback) {
        String value = context.payloadString(key, "");
        return value.isBlank() ? fallback : Boolean.parseBoolean(value);
    }

    private double doublePayload(AiNodeExecutionContext context, String key, double fallback) {
        String value = context.payloadString(key, "");
        if (value.isBlank()) {
            return fallback;
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }

    private int intPayload(AiNodeExecutionContext context, String key, int fallback) {
        String value = context.payloadString(key, "");
        if (value.isBlank()) {
            return fallback;
        }
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return fallback;
        }
    }
}
