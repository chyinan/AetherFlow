package com.aetherflow.ai.provider;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AiProviderRouterTest {

    @Test
    void routesRequestsToConfiguredProvider() {
        FakeProvider openAi = new FakeProvider(AiProviderType.OPENAI, "openai-result");
        FakeProvider ollama = new FakeProvider(AiProviderType.OLLAMA, "ollama-result");
        AiProviderRouter router = new AiProviderRouter(List.of(openAi, ollama), AiProviderType.OLLAMA);

        AiProviderResponse response = router.complete(new AiProviderRequest(
                AiProviderType.OPENAI,
                "gpt-4o-mini",
                "summarize",
                Map.of("temperature", 0.2),
                Duration.ofSeconds(10)
        ));

        assertThat(response.provider()).isEqualTo(AiProviderType.OPENAI);
        assertThat(response.text()).isEqualTo("openai-result");
        assertThat(openAi.called).isTrue();
        assertThat(ollama.called).isFalse();
    }

    @Test
    void usesDefaultProviderWhenRequestProviderIsNull() {
        FakeProvider ollama = new FakeProvider(AiProviderType.OLLAMA, "local-result");
        AiProviderRouter router = new AiProviderRouter(List.of(ollama), AiProviderType.OLLAMA);

        AiProviderResponse response = router.complete(new AiProviderRequest(
                null,
                "llama3",
                "translate",
                Map.of(),
                Duration.ofSeconds(5)
        ));

        assertThat(response.provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(response.text()).isEqualTo("local-result");
    }

    private static final class FakeProvider implements AiProvider {
        private final AiProviderType type;
        private final String response;
        private boolean called;

        private FakeProvider(AiProviderType type, String response) {
            this.type = type;
            this.response = response;
        }

        @Override
        public AiProviderType type() {
            return type;
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request) {
            called = true;
            return new AiProviderResponse(type, request.model(), response, Map.of("finishReason", "stop"));
        }
    }
}
