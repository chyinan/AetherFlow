package com.aetherflow.common.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.Map;

@Data
public class TaskMessageDTO {

    private Long taskId;
    /** 客户端重试同一异步操作时复用的幂等键。 */
    private String idempotencyKey;
    private Long workflowInstanceId;
    private Long userId;
    private String traceId;
    private String nodeId;
    private String nodeType;
    private Map<String, Object> payload;
    private Boolean enqueue = true;
    private Integer retryCount;
    private OffsetDateTime createdAt;
}

