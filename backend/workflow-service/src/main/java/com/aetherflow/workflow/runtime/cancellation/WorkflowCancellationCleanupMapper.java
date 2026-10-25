package com.aetherflow.workflow.runtime.cancellation;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Delete;

import java.time.LocalDateTime;
import java.util.List;

public interface WorkflowCancellationCleanupMapper extends BaseMapper<WorkflowCancellationCleanup> {

    @Insert("""
            INSERT IGNORE INTO af_workflow_cancellation_cleanup
                (workflow_instance_id, user_id, status, attempt_count, next_attempt_at, created_at, updated_at)
            SELECT id, user_id, 'PENDING', 0, #{now}, #{now}, #{now}
              FROM af_workflow_instance
             WHERE id = #{workflowInstanceId} AND user_id = #{userId} AND status = 'CANCELLED'
            """)
    int ensurePending(@Param("workflowInstanceId") Long workflowInstanceId,
                      @Param("userId") Long userId,
                      @Param("now") LocalDateTime now);

    @Select("""
            SELECT * FROM af_workflow_cancellation_cleanup
             WHERE workflow_instance_id = #{workflowInstanceId}
             LIMIT 1
            """)
    WorkflowCancellationCleanup findByWorkflowInstanceId(@Param("workflowInstanceId") Long workflowInstanceId);

    @Select("""
            SELECT * FROM af_workflow_cancellation_cleanup
             WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                OR (status = 'PROCESSING' AND updated_at <= #{staleBefore})
             ORDER BY id ASC
             LIMIT #{limit}
            """)
    List<WorkflowCancellationCleanup> selectDue(@Param("now") LocalDateTime now,
                                                @Param("staleBefore") LocalDateTime staleBefore,
                                                @Param("limit") int limit);

    @Update("""
            UPDATE af_workflow_cancellation_cleanup
               SET status = 'PROCESSING', lease_token = #{leaseToken},
                   attempt_count = attempt_count + 1, updated_at = #{now}
             WHERE id = #{id}
               AND ((status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                 OR (status = 'PROCESSING' AND updated_at <= #{staleBefore}))
            """)
    int claim(@Param("id") Long id,
              @Param("leaseToken") String leaseToken,
              @Param("now") LocalDateTime now,
              @Param("staleBefore") LocalDateTime staleBefore);

    @Update("""
            UPDATE af_workflow_cancellation_cleanup
               SET status = 'COMPLETE', lease_token = NULL, next_attempt_at = NULL,
                   completed_at = #{completedAt}, last_error = NULL, updated_at = #{completedAt}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int markComplete(@Param("id") Long id,
                     @Param("leaseToken") String leaseToken,
                     @Param("completedAt") LocalDateTime completedAt);

    @Update("""
            UPDATE af_workflow_cancellation_cleanup
               SET status = 'PENDING', lease_token = NULL, next_attempt_at = #{nextAttemptAt},
                   last_error = #{lastError}, updated_at = #{now}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int markRetry(@Param("id") Long id,
                  @Param("leaseToken") String leaseToken,
                  @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                  @Param("lastError") String lastError,
                  @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_workflow_cancellation_cleanup
               SET next_attempt_at = #{now}, updated_at = #{now}
             WHERE id = #{id} AND status = 'PENDING'
            """)
    int retryNow(@Param("id") Long id, @Param("now") LocalDateTime now);

    @Delete("""
            DELETE FROM af_workflow_cancellation_cleanup
             WHERE status IN ('COMPLETE', 'NOT_REQUIRED') AND updated_at < #{before}
             LIMIT #{limit}
            """)
    int deleteTerminalBefore(@Param("before") LocalDateTime before, @Param("limit") int limit);
}
