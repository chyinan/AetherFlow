package com.aetherflow.common.dto;

// pattern: Functional Core

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

@Data
public class GeneratedArtifactBatchRequestDTO {

    @NotNull
    @Positive
    private Long userId;

    @NotNull
    @Positive
    private Long aiJobId;

    @NotNull
    @Positive
    private Long taskId;

    @NotBlank
    private String workflowId;

    @NotBlank
    private String artifactBatchId;

    @NotNull
    @Positive
    private Integer expectedCount;
}
