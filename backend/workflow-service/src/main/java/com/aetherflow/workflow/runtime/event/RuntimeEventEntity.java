package com.aetherflow.workflow.runtime.event;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("af_workflow_runtime_event")
public class RuntimeEventEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String eventId;
    private String workflowId;
    private String traceId;
    private String taskId;
    private String eventType;
    private String nodeId;
    private String runtimeState;
    private LocalDateTime occurredAt;
    private String attributesJson;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
