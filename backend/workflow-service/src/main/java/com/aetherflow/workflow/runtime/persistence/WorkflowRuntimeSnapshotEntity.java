package com.aetherflow.workflow.runtime.persistence;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_runtime_snapshot")
public class WorkflowRuntimeSnapshotEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String workflowId;
    private String traceId;
    private String taskId;
    private Long definitionId;
    private String definitionJson;
    private String runtimeState;
    private String currentNodeIdsJson;
    private String completedNodeIdsJson;
    private String failedNodeIdsJson;
    private String variablesJson;
    private String nodeOutputsJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
