package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.prompt.PromptRenderResult;
import com.aetherflow.ai.prompt.PromptRenderService;
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
public class SummaryNodeExecutor implements AiNodeExecutor {

    private final PromptRenderService promptRenderService;
    private final AiProviderRouter providerRouter;
    private final AiTaskProperties properties;

    public SummaryNodeExecutor(PromptRenderService promptRenderService,
                               AiProviderRouter providerRouter,
                               AiTaskProperties properties) {
        this.promptRenderService = promptRenderService;
        this.providerRouter = providerRouter;
        this.properties = properties;
    }

    @Override
    public String nodeType() {
        return "SUMMARY";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        PromptRenderResult prompt = promptRenderService.render("summary", context.payloadString("promptVersion", ""),
                Map.of(
                        "text", context.payloadString("text"),
                        "language", context.payloadString("language", "English"),
                        "instruction", context.payloadString("prompt", "Focus on the key decisions and action items.")
                ));
        AiProviderResponse response = providerRouter.complete(new AiProviderRequest(
                AiProviderType.from(context.payloadString("provider", ""), null),
                context.payloadString("model", properties.getDefaultModel()),
                prompt.content(),
                Map.of("temperature", 0.2),
                properties.getProviderTimeout()
        ));
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("summary", response.text());
        output.put("language", context.payloadString("language", "English"));
        output.put("provider", response.provider().name());
        output.put("model", response.model());
        output.put("promptVersion", prompt.version());
        return new AiNodeResult(nodeType(), "SUCCEEDED", output, List.of());
    }
}
