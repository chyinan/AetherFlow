package com.aetherflow.ai.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_ai_job")
public class AiJob {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long taskId;
    private String idempotencyKey;
    private Long workflowInstanceId;
    private String jobType;
    private String inputJson;
    private String outputJson;
    private String status;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    private LocalDateTime updatedAt;
}

