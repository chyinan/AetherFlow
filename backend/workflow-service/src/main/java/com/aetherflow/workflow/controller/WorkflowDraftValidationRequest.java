package com.aetherflow.workflow.controller;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/** A read-only validation request for the two Copilot recipes supported by the editor. */
public record WorkflowDraftValidationRequest(
        Long definitionId,
        @Positive Integer expectedVersion,
        @NotBlank String recipe,
        @NotNull @Valid WorkflowDefinitionDTO definition
) {
}
