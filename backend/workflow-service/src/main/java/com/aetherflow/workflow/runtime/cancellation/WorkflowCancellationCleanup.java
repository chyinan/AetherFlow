package com.aetherflow.workflow.runtime.cancellation;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_cancellation_cleanup")
public class WorkflowCancellationCleanup {
    public static final String PENDING = "PENDING";
    public static final String PROCESSING = "PROCESSING";
    public static final String COMPLETE = "COMPLETE";
    public static final String NOT_REQUIRED = "NOT_REQUIRED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long workflowInstanceId;
    private Long userId;
    private String status;
    private String leaseToken;
    private Integer attemptCount;
    private LocalDateTime nextAttemptAt;
    private LocalDateTime completedAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
