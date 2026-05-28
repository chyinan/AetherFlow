package com.aetherflow.common.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

@Data
public class AiWorkflowNodeRequestDTO {

    @NotBlank
    private String workflowId;

    @NotBlank
    private String traceId;

    private String taskId;

    @NotBlank
    private String nodeId;

    @NotBlank
    private String nodeType;

    private Map<String, Object> payload;
}
