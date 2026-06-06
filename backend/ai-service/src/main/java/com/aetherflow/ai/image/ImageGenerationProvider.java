package com.aetherflow.ai.image;

public interface ImageGenerationProvider {

    ImageProviderType type();

    ImageGenerationResponse generate(ImageGenerationRequest request);

    default ImageGenerationResponse upscale(ImageGenerationRequest request) {
        return generate(request);
    }
}
