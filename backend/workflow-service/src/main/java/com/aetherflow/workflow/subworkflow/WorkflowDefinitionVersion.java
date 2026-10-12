package com.aetherflow.workflow.subworkflow;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

/** 每次成功保存后保留的不可变定义版本。 */
@Data
@TableName("af_workflow_definition_version")
public class WorkflowDefinitionVersion {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long definitionId;
    private Integer version;
    private Long ownerUserId;
    private String definitionJson;
    private LocalDateTime createdAt;
}
