package com.aetherflow.common.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class WorkflowDefinitionDTO {

    @NotBlank
    private String name;

    private String description;

    @NotEmpty
    private List<WorkflowNodeDTO> nodes;
}

