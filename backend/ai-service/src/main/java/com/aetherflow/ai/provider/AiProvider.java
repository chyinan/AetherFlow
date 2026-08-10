package com.aetherflow.ai.provider;

import java.util.stream.Stream;
import java.util.function.Consumer;

public interface AiProvider {

    AiProviderType type();

    AiProviderResponse complete(AiProviderRequest request);

    default AiProviderResponse generate(AiProviderRequest request) {
        return complete(request);
    }

    default Stream<AiProviderResponse> stream(AiProviderRequest request) {
        return Stream.of(generate(request));
    }

    default void stream(AiProviderRequest request, Consumer<AiProviderResponse> consumer) {
        stream(request).forEach(consumer);
    }

    default AiEmbeddingResponse embedding(AiEmbeddingRequest request) {
        throw new UnsupportedOperationException("embedding is not supported by provider " + type());
    }

    default AiProviderHealth health() {
        return AiProviderHealth.unknown(type(), "provider health is unavailable");
    }
}
