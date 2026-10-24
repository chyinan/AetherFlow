package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class LlmNodeExecutor implements AiNodeExecutor {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<Map<String, Object>> OBJECT_TYPE = new TypeReference<>() {
    };

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
                properties.getProviderTimeout(),
                context.taskMessage() == null ? null : context.taskMessage().getUserId()
        ));
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("completionText", response.text());
        output.put("provider", response.provider().name());
        output.put("model", response.model());
        output.put("metadata", response.metadata() == null ? Map.of() : response.metadata());
        if (Boolean.TRUE.equals(options.get("structuredOutput"))) {
            output.put("jsonData", structuredJsonData(response));
        }
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }

    /**
     * 结构化输出取值：Provider 已回填 metadata.jsonData 时以其为准（更权威），
     * 否则从 completionText 解析顶层 JSON 对象。解析失败返回空 Map，交由
     * workflow-service 的适配器按各自节点契约报可恢复错误。
     */
    private Map<String, Object> structuredJsonData(AiProviderResponse response) {
        Map<String, Object> metadata = response.metadata();
        if (metadata != null) {
            Object provided = metadata.get("jsonData");
            if (provided instanceof Map<?, ?> providedMap && !providedMap.isEmpty()) {
                Map<String, Object> normalized = new LinkedHashMap<>();
                providedMap.forEach((key, value) -> {
                    if (key != null && value != null) {
                        normalized.put(String.valueOf(key), value);
                    }
                });
                return Map.copyOf(normalized);
            }
        }
        return parseObjectText(response.text());
    }

    private Map<String, Object> parseObjectText(String text) {
        String candidate = stripCodeFence(text);
        // 只接受对象字面量：数组、标量和坏 JSON 都按"没有结构化输出"处理。
        if (!candidate.startsWith("{")) {
            return Map.of();
        }
        try {
            JsonNode node = JSON.readTree(candidate);
            if (node == null || !node.isObject()) {
                return Map.of();
            }
            Map<String, Object> parsed = JSON.convertValue(node, OBJECT_TYPE);
            if (parsed == null) {
                return Map.of();
            }
            Map<String, Object> normalized = new LinkedHashMap<>();
            parsed.forEach((key, value) -> {
                if (key != null && value != null) {
                    normalized.put(key, value);
                }
            });
            return Map.copyOf(normalized);
        } catch (Exception ignored) {
            return Map.of();
        }
    }

    private String stripCodeFence(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (!trimmed.startsWith("```")) {
            return trimmed;
        }
        String withoutOpening = trimmed.substring(3);
        int firstLineBreak = withoutOpening.indexOf('\n');
        if (firstLineBreak >= 0) {
            String languageTag = withoutOpening.substring(0, firstLineBreak).trim();
            if (languageTag.isEmpty() || languageTag.matches("[A-Za-z0-9_+-]+")) {
                withoutOpening = withoutOpening.substring(firstLineBreak + 1);
            }
        }
        int closing = withoutOpening.lastIndexOf("```");
        return (closing >= 0 ? withoutOpening.substring(0, closing) : withoutOpening).trim();
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
