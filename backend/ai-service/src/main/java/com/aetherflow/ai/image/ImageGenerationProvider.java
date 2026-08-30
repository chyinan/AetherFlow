package com.aetherflow.ai.image;

// pattern: Imperative Shell
public interface ImageGenerationProvider {

    ImageProviderType type();

    ImageGenerationResponse generate(ImageGenerationRequest request);

    default ImageGenerationResponse upscale(ImageGenerationRequest request) {
        return generate(request);
    }

    default boolean isAvailable() {
        return true;
    }
}
