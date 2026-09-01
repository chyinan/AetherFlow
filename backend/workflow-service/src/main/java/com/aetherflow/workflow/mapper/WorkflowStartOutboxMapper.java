package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

public interface WorkflowStartOutboxMapper extends BaseMapper<WorkflowStartOutbox> {

    @Select("""
            SELECT * FROM af_workflow_start_outbox
            WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
               OR (status IN ('DISPATCHING', 'DISPATCHED') AND updated_at <= #{staleBefore})
            ORDER BY id ASC
            LIMIT #{limit}
            """)
    List<WorkflowStartOutbox> selectDue(@Param("now") LocalDateTime now,
                                        @Param("staleBefore") LocalDateTime staleBefore,
                                        @Param("limit") int limit);

    @Update("""
            UPDATE af_workflow_start_outbox
            SET status = 'DISPATCHING', lease_token = UUID(), attempt_count = attempt_count + 1, updated_at = #{now}
            WHERE id = #{id}
              AND ((status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                OR (status IN ('DISPATCHING', 'DISPATCHED') AND updated_at <= #{staleBefore}))
            """)
    int claim(@Param("id") Long id,
              @Param("now") LocalDateTime now,
              @Param("staleBefore") LocalDateTime staleBefore);

    @Update("""
            UPDATE af_workflow_start_outbox
            SET status = 'DISPATCHED', lease_token = NULL, last_error = NULL, updated_at = #{now}
            WHERE workflow_instance_id = #{workflowInstanceId}
              AND status = 'DISPATCHING'
            """)
    int markDispatched(@Param("workflowInstanceId") Long workflowInstanceId,
                       @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_workflow_start_outbox
            SET status = 'PENDING', lease_token = NULL, next_attempt_at = #{nextAttemptAt},
                last_error = #{lastError}, updated_at = #{now}
            WHERE id = #{id} AND status = 'DISPATCHING'
            """)
    int markRetry(@Param("id") Long id,
                  @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                  @Param("lastError") String lastError,
                  @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_workflow_start_outbox
               SET status = 'DISPATCHED', lease_token = NULL, last_error = NULL, updated_at = #{now}
             WHERE workflow_instance_id = #{workflowInstanceId}
               AND status = 'DISPATCHING' AND lease_token = #{leaseToken}
            """)
    int markDispatchedOwned(@Param("workflowInstanceId") Long workflowInstanceId,
                            @Param("leaseToken") String leaseToken,
                            @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_workflow_start_outbox
               SET updated_at = #{now}
             WHERE id = #{id} AND status = 'DISPATCHING' AND lease_token = #{leaseToken}
            """)
    int touchDispatching(@Param("id") Long id,
                         @Param("leaseToken") String leaseToken,
                         @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_workflow_start_outbox
               SET status = 'PENDING', lease_token = NULL, next_attempt_at = #{nextAttemptAt},
                   last_error = #{lastError}, updated_at = #{now}
             WHERE id = #{id} AND status = 'DISPATCHING' AND lease_token = #{leaseToken}
            """)
    int markRetryOwned(@Param("id") Long id,
                       @Param("leaseToken") String leaseToken,
                       @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                       @Param("lastError") String lastError,
                       @Param("now") LocalDateTime now);
}
