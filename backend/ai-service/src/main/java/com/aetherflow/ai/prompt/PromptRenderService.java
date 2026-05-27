package com.aetherflow.ai.prompt;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class PromptRenderService {

    private final PromptTemplateRegistry registry;

    public PromptRenderResult render(String templateName, String version, Map<String, ?> variables) {
        PromptVersion promptVersion = registry.getRequired(templateName, version);
        String rendered = promptVersion.content();
        for (Map.Entry<String, ?> entry : variables.entrySet()) {
            String token = "{{" + entry.getKey() + "}}";
            rendered = rendered.replace(token, String.valueOf(entry.getValue()));
        }
        return new PromptRenderResult(promptVersion.templateName(), promptVersion.version(), rendered);
    }
}
