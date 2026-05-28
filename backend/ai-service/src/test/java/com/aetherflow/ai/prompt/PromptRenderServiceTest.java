package com.aetherflow.ai.prompt;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PromptRenderServiceTest {

    @Test
    void rendersVersionedTemplateWithVariables() {
        InMemoryPromptTemplateRegistry registry = new InMemoryPromptTemplateRegistry();
        PromptRenderService renderService = new PromptRenderService(registry);

        PromptRenderResult result = renderService.render("summary", "v1", Map.of(
                "text", "AetherFlow makes AI workflows reliable.",
                "language", "English",
                "instruction", "Focus on action items."
        ));

        assertThat(result.templateName()).isEqualTo("summary");
        assertThat(result.version()).isEqualTo("v1");
        assertThat(result.content()).contains("AetherFlow makes AI workflows reliable.");
        assertThat(result.content()).contains("summary");
    }

    @Test
    void fallsBackToActiveVersionWhenVersionIsBlank() {
        InMemoryPromptTemplateRegistry registry = new InMemoryPromptTemplateRegistry();
        PromptRenderService renderService = new PromptRenderService(registry);

        PromptRenderResult result = renderService.render("translate", "", Map.of(
                "text", "hello",
                "targetLanguage", "Chinese"
        ));

        assertThat(result.version()).isEqualTo("v1");
        assertThat(result.content()).contains("Chinese");
        assertThat(result.content()).contains("hello");
    }

    @Test
    void rendersSummaryLanguageAndInstruction() {
        InMemoryPromptTemplateRegistry registry = new InMemoryPromptTemplateRegistry();
        PromptRenderService renderService = new PromptRenderService(registry);

        PromptRenderResult result = renderService.render("summary", "v1", Map.of(
                "text", "Long meeting transcript",
                "language", "Chinese",
                "instruction", "Focus on action items"
        ));

        assertThat(result.content()).contains("Chinese");
        assertThat(result.content()).contains("Focus on action items");
        assertThat(result.content()).contains("Long meeting transcript");
    }
}
