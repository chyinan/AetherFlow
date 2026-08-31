package com.aetherflow.ai.file;

// pattern: Functional Core

import com.aetherflow.common.dto.FileMetadataDTO;

import java.util.List;

public record ArtifactRegistrationResult(
        String batchId,
        int expectedCount,
        List<FileMetadataDTO> files
) {
    public ArtifactRegistrationResult {
        files = files == null ? List.of() : List.copyOf(files);
    }

    public static ArtifactRegistrationResult empty() {
        return new ArtifactRegistrationResult(null, 0, List.of());
    }
}
