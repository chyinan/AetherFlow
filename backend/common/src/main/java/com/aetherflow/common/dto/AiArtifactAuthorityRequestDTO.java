package com.aetherflow.common.dto;

// pattern: Functional Core

import lombok.Data;

@Data
public class AiArtifactAuthorityRequestDTO {

    private Long userId;
    private Long aiJobId;
    private Long taskId;
    private Long workflowInstanceId;
    private String leaseToken;
    private String operation;
}
