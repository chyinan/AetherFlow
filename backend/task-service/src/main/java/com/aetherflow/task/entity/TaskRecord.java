package com.aetherflow.task.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_task_record")
public class TaskRecord {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long workflowInstanceId;
    private String nodeId;
    private String nodeType;
    private String payloadJson;
    private Integer retryCount;
    private String status;
    private LocalDateTime nextRetryAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

