package com.aetherflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AiWorkflowNodeResponseDTO {

    private String nodeType;
    private String status;
    private Map<String, Object> output;
}
