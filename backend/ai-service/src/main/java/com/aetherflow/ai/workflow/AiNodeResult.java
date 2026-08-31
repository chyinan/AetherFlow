package com.aetherflow.ai.workflow;

// pattern: Functional Core

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.ai.file.ArtifactRegistrationResult;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public record AiNodeResult(
        String nodeType,
        String status,
        Map<String, Object> output,
        List<AiArtifact> artifacts,
        String artifactBatchId,
        Integer artifactCount
) {

    public AiNodeResult(String nodeType, String status, Map<String, Object> output, List<AiArtifact> artifacts) {
        this(nodeType, status, output, artifacts, null, null);
    }

    public AiNodeResult withStoredArtifactFiles(List<FileMetadataDTO> files) {
        return withStoredArtifactFiles(new ArtifactRegistrationResult(null, files == null ? 0 : files.size(), files));
    }

    public AiNodeResult withStoredArtifactFiles(ArtifactRegistrationResult registration) {
        List<FileMetadataDTO> files = registration == null ? List.of() : registration.files();
        if (files == null || files.isEmpty()) {
            return new AiNodeResult(nodeType, status, output, List.of(), null, null);
        }
        Map<String, Object> enrichedOutput = new LinkedHashMap<>(output == null ? Map.of() : output);
        enrichedOutput.put("artifactFiles", List.copyOf(files));
        int mappedCount = Math.min(artifacts == null ? 0 : artifacts.size(), files.size());
        for (int index = 0; index < mappedCount; index++) {
            AiArtifact artifact = artifacts.get(index);
            FileMetadataDTO file = files.get(index);
            if (artifact == null || file == null || artifact.type() == null || artifact.type().isBlank()) {
                continue;
            }
            String prefix = artifact.type().trim().toLowerCase(Locale.ROOT);
            if (file.getId() != null) {
                enrichedOutput.put(prefix + "FileId", file.getId());
            }
            if (file.getObjectKey() != null && !file.getObjectKey().isBlank()) {
                enrichedOutput.put(prefix + "ObjectKey", file.getObjectKey());
            }
            if (file.getUrl() != null && !file.getUrl().isBlank()) {
                enrichedOutput.put(prefix + "Url", file.getUrl());
            }
        }
        // The staged outbox payload intentionally contains no signed URL. Rebuild
        // legacy convenience URL fields from committed metadata by extension so
        // clients do not retain an expired STAGED link after a delayed outbox.
        for (FileMetadataDTO file : files) {
            String prefix = legacyPrefix(file == null ? null : file.getOriginalName());
            if (prefix != null && file.getUrl() != null && !file.getUrl().isBlank()) {
                enrichedOutput.put(prefix + "Url", file.getUrl());
            }
        }
        return new AiNodeResult(nodeType, status, Map.copyOf(enrichedOutput), List.of(),
                registration == null ? null : registration.batchId(),
                registration == null ? files.size() : registration.expectedCount());
    }

    private static String legacyPrefix(String originalName) {
        if (originalName == null || originalName.isBlank()) {
            return null;
        }
        String name = originalName.toLowerCase(Locale.ROOT);
        if (name.endsWith(".srt")) return "srt";
        if (name.endsWith(".vtt")) return "vtt";
        if (name.endsWith(".wav") || name.endsWith(".mp3") || name.endsWith(".m4a") || name.endsWith(".aac")) return "media";
        return null;
    }
}
