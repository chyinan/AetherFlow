package com.aetherflow.workflow.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_definition")
public class WorkflowDefinition {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String name;
    private String description;
    private String definitionJson;
    private Integer version;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

