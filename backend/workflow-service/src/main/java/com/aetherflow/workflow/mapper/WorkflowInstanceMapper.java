package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

// pattern: Imperative Shell
public interface WorkflowInstanceMapper extends BaseMapper<WorkflowInstance> {

    @Select("""
            SELECT * FROM af_workflow_instance
             WHERE user_id = #{userId} AND idempotency_key = #{idempotencyKey}
             ORDER BY id ASC
             LIMIT 1
            """)
    WorkflowInstance findByUserIdAndIdempotencyKey(@Param("userId") Long userId,
                                                   @Param("idempotencyKey") String idempotencyKey);

    @Insert("""
            INSERT INTO af_workflow_instance
                (definition_id, user_id, idempotency_key, status, input_json, current_node_id,
                 started_at, completed_at, updated_at)
            VALUES
                (#{definitionId}, #{userId}, #{idempotencyKey}, #{status}, #{inputJson}, #{currentNodeId},
                 #{startedAt}, #{completedAt}, #{updatedAt})
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    int insertIdempotent(WorkflowInstance instance);

    @Update("""
            UPDATE af_workflow_instance
            SET status = 'CANCELLED',
                completed_at = #{completedAt},
                updated_at = #{completedAt}
            WHERE id = #{id}
              AND user_id = #{userId}
              AND status IN ('PENDING', 'RUNNING', 'RETRYING', 'WAITING')
            """)
    int cancelIfActive(@Param("id") Long id,
                       @Param("userId") Long userId,
                       @Param("completedAt") LocalDateTime completedAt);

    @Update("""
            UPDATE af_workflow_instance
            SET status = #{status},
                current_node_id = #{currentNodeId},
                completed_at = CASE
                    WHEN #{completedAt} IS NULL THEN completed_at
                    ELSE #{completedAt}
                END,
                updated_at = #{updatedAt}
            WHERE id = #{id}
              AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
            """)
    int transitionRuntimeState(@Param("id") Long id,
                               @Param("status") String status,
                               @Param("currentNodeId") String currentNodeId,
                               @Param("completedAt") LocalDateTime completedAt,
                               @Param("updatedAt") LocalDateTime updatedAt);
}

