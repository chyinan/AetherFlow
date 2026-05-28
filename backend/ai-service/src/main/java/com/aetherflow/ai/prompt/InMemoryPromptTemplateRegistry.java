package com.aetherflow.ai.prompt;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class InMemoryPromptTemplateRegistry implements PromptTemplateRegistry {

    private final Map<String, PromptTemplate> templates;

    public InMemoryPromptTemplateRegistry() {
        this.templates = List.of(
                new PromptTemplate("summary", List.of(
                        new PromptVersion("summary", "v1",
                                "You are an enterprise AI workflow assistant. Write a concise summary in {{language}}. {{instruction}}\n{{text}}",
                                true)
                )),
                new PromptTemplate("translate", List.of(
                        new PromptVersion("translate", "v1",
                                "Translate the following text to {{targetLanguage}}. Keep domain terms accurate:\n{{text}}",
                                true)
                )),
                new PromptTemplate("subtitle", List.of(
                        new PromptVersion("subtitle", "v1",
                                "Convert this transcript into clean subtitle lines:\n{{text}}",
                                true)
                ))
        ).stream().collect(Collectors.toUnmodifiableMap(template -> normalize(template.name()), Function.identity()));
    }

    @Override
    public PromptVersion getRequired(String templateName, String version) {
        PromptTemplate template = templates.get(normalize(templateName));
        if (template == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "prompt template not found: " + templateName);
        }
        if (version != null && !version.isBlank()) {
            return template.versions().stream()
                    .filter(candidate -> candidate.version().equalsIgnoreCase(version))
                    .findFirst()
                    .orElseThrow(() -> new BusinessException(ResultCode.BAD_REQUEST,
                            "prompt version not found: " + templateName + ":" + version));
        }
        Optional<PromptVersion> activeVersion = template.versions().stream()
                .filter(PromptVersion::active)
                .findFirst();
        return activeVersion.orElseGet(() -> template.versions().get(0));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
