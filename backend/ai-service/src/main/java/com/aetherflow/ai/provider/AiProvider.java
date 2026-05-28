package com.aetherflow.ai.provider;

import java.util.stream.Stream;

public interface AiProvider {

    AiProviderType type();

    AiProviderResponse complete(AiProviderRequest request);

    default AiProviderResponse generate(AiProviderRequest request) {
        return complete(request);
    }

    default Stream<AiProviderResponse> stream(AiProviderRequest request) {
        return Stream.of(generate(request));
    }

    default AiEmbeddingResponse embedding(AiEmbeddingRequest request) {
        throw new UnsupportedOperationException("embedding is not supported by provider " + type());
    }

    default AiProviderHealth health() {
        return AiProviderHealth.unknown(type(), "health check not implemented");
    }
}
