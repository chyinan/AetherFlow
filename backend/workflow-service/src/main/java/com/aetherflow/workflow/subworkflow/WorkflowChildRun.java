package com.aetherflow.workflow.subworkflow;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("af_workflow_child_run")
public class WorkflowChildRun {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long parentInstanceId;
    private String parentNodeId;
    private String invocationKey;
    private Long childInstanceId;
    private Long definitionId;
    private Integer definitionVersion;
    private Long ownerUserId;
    private String outputMappingsJson;
    private String status;
    private LocalDateTime nextAttemptAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
