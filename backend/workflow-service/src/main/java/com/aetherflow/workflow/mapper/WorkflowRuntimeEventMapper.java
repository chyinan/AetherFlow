package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.runtime.event.RuntimeEventEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface WorkflowRuntimeEventMapper extends BaseMapper<RuntimeEventEntity> {

    @Insert("""
            INSERT INTO af_workflow_runtime_event
                (event_id, workflow_id, trace_id, task_id, event_type, node_id, runtime_state,
                 occurred_at, attributes_json, created_at, updated_at)
            VALUES
                (#{eventId}, #{workflowId}, #{traceId}, #{taskId}, #{eventType}, #{nodeId}, #{runtimeState},
                 #{occurredAt}, #{attributesJson}, #{createdAt}, #{updatedAt})
            ON DUPLICATE KEY UPDATE event_id = event_id
            """)
    int insertIfAbsent(RuntimeEventEntity entity);

    @Delete("""
            DELETE FROM af_workflow_runtime_event
             WHERE occurred_at < #{before}
             LIMIT #{limit}
            """)
    int deleteBefore(@Param("before") LocalDateTime before, @Param("limit") int limit);
}
