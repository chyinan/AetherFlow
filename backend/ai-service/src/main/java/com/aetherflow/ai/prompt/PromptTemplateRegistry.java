package com.aetherflow.ai.prompt;

public interface PromptTemplateRegistry {

    PromptVersion getRequired(String templateName, String version);
}
