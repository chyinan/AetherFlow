package com.aetherflow.ai.workflow;

// pattern: Functional Core

public record AiArtifact(String type, String fileName, String contentType, byte[] content) {

    public AiArtifact {
        content = content == null ? new byte[0] : content.clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }
}
