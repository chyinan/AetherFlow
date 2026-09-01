package com.aetherflow.workflow.entity;

// pattern: Functional Core

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_start_outbox")
public class WorkflowStartOutbox {
    public static final String PENDING = "PENDING";
    public static final String DISPATCHING = "DISPATCHING";
    public static final String DISPATCHED = "DISPATCHED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long workflowInstanceId;
    private String status;
    private String leaseToken;
    private Integer attemptCount;
    private LocalDateTime nextAttemptAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
