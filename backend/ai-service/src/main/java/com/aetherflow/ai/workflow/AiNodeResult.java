package com.aetherflow.ai.workflow;

import java.util.List;
import java.util.Map;

public record AiNodeResult(
        String nodeType,
        String status,
        Map<String, Object> output,
        List<AiArtifact> artifacts
) {
}
