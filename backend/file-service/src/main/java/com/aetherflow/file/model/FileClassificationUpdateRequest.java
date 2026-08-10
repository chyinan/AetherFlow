package com.aetherflow.file.model;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class FileClassificationUpdateRequest {

    @NotBlank
    private String source;

    private String artifactKind;

    private String workflowId;
}
