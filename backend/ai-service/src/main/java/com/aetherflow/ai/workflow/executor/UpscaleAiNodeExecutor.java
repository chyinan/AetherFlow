package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.image.ImageGenerationRequest;
import com.aetherflow.ai.image.ImageGenerationResponse;
import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import org.springframework.stereotype.Component;

@Component
public class UpscaleAiNodeExecutor extends ImageGenerationAiNodeExecutor {

    public UpscaleAiNodeExecutor(ImageProviderRegistry providerRegistry) {
        super(providerRegistry);
    }

    @Override
    public String nodeType() {
        return "UPSCALE";
    }

    @Override
    public AiNodeResult execute(AiNodeExecutionContext context) {
        ImageGenerationRequest request = request(context.payload(), "upscale");
        ImageGenerationResponse response = providerRegistry().getRequired(request.provider().name()).upscale(request);
        return result(nodeType(), response);
    }
}
