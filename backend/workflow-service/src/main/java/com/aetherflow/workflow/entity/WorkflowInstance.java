package com.aetherflow.workflow.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_instance")
@Schema(description = "Persisted workflow instance response.")
public class WorkflowInstance {

    @TableId(type = IdType.AUTO)
    @Schema(description = "Workflow instance id.", example = "1001")
    private Long id;

    @Schema(description = "Workflow definition id.", example = "1")
    private Long definitionId;

    @Schema(description = "Owner user id.", example = "10001")
    private Long userId;

    @Schema(description = "Workflow instance status.", example = "RUNNING")
    private String status;

    @Schema(description = "Serialized workflow input JSON.")
    private String inputJson;

    @Schema(description = "Current node id.", example = "node-summary-1")
    private String currentNodeId;

    @Schema(description = "Workflow start time.")
    private LocalDateTime startedAt;

    @Schema(description = "Workflow completion time.")
    private LocalDateTime completedAt;

    @Schema(description = "Last update time.")
    private LocalDateTime updatedAt;
}

