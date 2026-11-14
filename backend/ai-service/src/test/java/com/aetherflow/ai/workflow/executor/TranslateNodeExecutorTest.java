package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.prompt.InMemoryPromptTemplateRegistry;
import com.aetherflow.ai.prompt.PromptRenderService;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TranslateNodeExecutorTest {

    @Test
    void includesConfiguredSourceLanguageInProviderPrompt() {
        AiProviderRouter providerRouter = mock(AiProviderRouter.class);
        when(providerRouter.complete(any(AiProviderRequest.class))).thenReturn(new AiProviderResponse(
                AiProviderType.OLLAMA, "llama3", "Hello", Map.of()
        ));
        TranslateNodeExecutor executor = executor(providerRouter);

        AiNodeResult result = executor.execute(new AiNodeExecutionContext(new TaskMessageDTO(), Map.of(
                "text", "你好",
                "sourceLanguage", "zh",
                "targetLanguage", "en-US"
        )));

        verify(providerRouter).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.prompt().contains("into en-US")
                        && request.prompt().contains("source language is zh")
                        && request.prompt().contains("你好")
        ));
        assertThat(result.output()).containsEntry("translatedText", "Hello");
        assertThat(result.output()).containsEntry("targetLanguage", "en-US");
    }

    @Test
    void defaultsSourceLanguageToAutomaticDetection() {
        AiProviderRouter providerRouter = mock(AiProviderRouter.class);
        when(providerRouter.complete(any(AiProviderRequest.class))).thenReturn(new AiProviderResponse(
                AiProviderType.OLLAMA, "llama3", "Hello", Map.of()
        ));
        TranslateNodeExecutor executor = executor(providerRouter);

        executor.execute(new AiNodeExecutionContext(new TaskMessageDTO(), Map.of(
                "text", "你好",
                "targetLanguage", "English"
        )));

        verify(providerRouter).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.prompt().contains("source language is auto")
                        && request.prompt().contains("if it is auto, detect it from the text")
        ));
    }

    @Test
    void preservesTemplateLikeTokensInTranslationText() {
        AiProviderRouter providerRouter = mock(AiProviderRouter.class);
        when(providerRouter.complete(any(AiProviderRequest.class))).thenReturn(new AiProviderResponse(
                AiProviderType.OLLAMA, "llama3", "Translated text", Map.of()
        ));
        TranslateNodeExecutor executor = executor(providerRouter);

        executor.execute(new AiNodeExecutionContext(new TaskMessageDTO(), Map.of(
                "text", "Keep this literal token: {{sourceLanguage}}",
                "sourceLanguage", "zh",
                "targetLanguage", "en-US"
        )));

        verify(providerRouter).complete(org.mockito.ArgumentMatchers.argThat(request ->
                request.prompt().contains("Keep this literal token: {{sourceLanguage}}")
        ));
    }

    private TranslateNodeExecutor executor(AiProviderRouter providerRouter) {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setDefaultModel("llama3");
        return new TranslateNodeExecutor(
                new PromptRenderService(new InMemoryPromptTemplateRegistry()), providerRouter, properties
        );
    }
}
