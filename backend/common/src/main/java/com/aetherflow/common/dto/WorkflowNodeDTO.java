package com.aetherflow.common.dto;

import lombok.Data;

import java.util.Map;

@Data
public class WorkflowNodeDTO {

    private String nodeId;
    private String nodeType;
    private String displayName;
    private Map<String, Object> config;
}

