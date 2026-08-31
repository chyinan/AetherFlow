package com.aetherflow.workflow.runtime.notification;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_notification_outbox")
// pattern: Functional Core
public class WorkflowTerminalNotificationOutbox {

    public static final String PENDING = "PENDING";
    public static final String DISPATCHING = "DISPATCHING";
    public static final String DISPATCHED = "DISPATCHED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long workflowInstanceId;
    private Long userId;
    private String eventId;
    private String status;
    private Integer attemptCount;
    private String payloadJson;
    private LocalDateTime nextAttemptAt;
    private LocalDateTime publishedAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
