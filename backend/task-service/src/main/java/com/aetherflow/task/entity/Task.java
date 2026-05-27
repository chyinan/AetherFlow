package com.aetherflow.task.entity;

import com.aetherflow.common.entity.BaseEntity;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("af_task_record")
@Schema(description = "Asynchronous workflow task record.")
public class Task extends BaseEntity {

    @Schema(description = "Workflow instance id.", example = "1001")
    private Long workflowInstanceId;

    @Schema(description = "Workflow node id.", example = "node-transcribe")
    private String nodeId;

    @Schema(description = "Workflow node type.", example = "AI_TRANSCRIPTION")
    private String nodeType;

    @Schema(description = "Task payload serialized as JSON.")
    private String payloadJson;

    @Schema(description = "Current retry count.", example = "0")
    private Integer retryCount;

    @Schema(description = "Task status.", example = "QUEUED")
    private String status;

    @Schema(description = "Next retry time or timeout deadline.")
    private LocalDateTime nextRetryAt;
}
