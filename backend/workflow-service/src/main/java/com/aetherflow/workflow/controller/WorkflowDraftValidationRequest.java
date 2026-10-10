package com.aetherflow.workflow.controller;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

/** 只读草稿校验，支持固定摘要规划与通用画布编辑。 */
public record WorkflowDraftValidationRequest(
        Long definitionId,
        @Positive Integer expectedVersion,
        @NotBlank String recipe,
        @NotNull @Valid WorkflowDefinitionDTO definition
) {
}
