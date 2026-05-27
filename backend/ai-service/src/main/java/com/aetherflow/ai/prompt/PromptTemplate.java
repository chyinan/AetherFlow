package com.aetherflow.ai.prompt;

import java.util.List;

public record PromptTemplate(String name, List<PromptVersion> versions) {
}
