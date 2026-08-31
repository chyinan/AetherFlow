package com.aetherflow.workflow.mapper;

import com.aetherflow.workflow.runtime.event.RuntimeEventEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface WorkflowRuntimeEventMapper extends BaseMapper<RuntimeEventEntity> {

    @Delete("""
            DELETE FROM af_workflow_runtime_event
             WHERE occurred_at < #{before}
             LIMIT #{limit}
            """)
    int deleteBefore(@Param("before") LocalDateTime before, @Param("limit") int limit);
}
