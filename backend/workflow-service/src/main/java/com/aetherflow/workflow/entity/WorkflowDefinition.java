package com.aetherflow.workflow.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_definition")
@Schema(description = "Persisted workflow definition response.")
public class WorkflowDefinition {

    @TableId(type = IdType.AUTO)
    @Schema(description = "Workflow definition id.", example = "1")
    private Long id;

    @Schema(description = "Workflow name.", example = "Media digest workflow")
    private String name;

    @Schema(description = "Workflow description.", example = "Upload media, transcribe, summarize, export and notify.")
    private String description;

    @Schema(description = "Owning project id.", example = "7")
    private Long projectId;

    @Schema(description = "Owner user id.", example = "10001")
    private Long ownerUserId;

    @Schema(description = "Owner username.", example = "aether.operator")
    private String ownerName;

    @Schema(description = "Serialized workflow definition JSON.")
    private String definitionJson;

    @Schema(description = "Workflow definition version.", example = "1")
    private Integer version;

    @Schema(description = "Workflow definition status.", example = "DRAFT")
    private String status;

    @Schema(description = "Creation time.")
    private LocalDateTime createdAt;

    @Schema(description = "Last update time.")
    private LocalDateTime updatedAt;
}

