package com.aetherflow.common.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
public class TaskMessageDTO {

    private Long taskId;
    private Long workflowInstanceId;
    private String nodeId;
    private String nodeType;
    private Map<String, Object> payload;
    private Integer retryCount;
    private OffsetDateTime createdAt;
}

