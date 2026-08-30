package com.aetherflow.ai.outbox;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

// pattern: Functional Core
@Data
@TableName("af_ai_task_event_outbox")
public class AiTaskEventOutbox {

    public static final String PENDING = "PENDING";
    public static final String PROCESSING = "PROCESSING";
    public static final String PUBLISHED = "PUBLISHED";

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long aiJobId;
    private Long taskId;
    private String eventId;
    private String eventType;
    private String payloadJson;
    private String status;
    private Integer attemptCount;
    private LocalDateTime nextAttemptAt;
    private LocalDateTime publishedAt;
    private String lastError;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
