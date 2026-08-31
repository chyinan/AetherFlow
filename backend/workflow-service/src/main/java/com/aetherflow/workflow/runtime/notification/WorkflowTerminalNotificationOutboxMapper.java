package com.aetherflow.workflow.runtime.notification;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

// pattern: Imperative Shell
public interface WorkflowTerminalNotificationOutboxMapper extends BaseMapper<WorkflowTerminalNotificationOutbox> {

    @Select("""
            SELECT * FROM af_workflow_notification_outbox
             WHERE (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                OR (status = 'DISPATCHING' AND updated_at <= #{staleBefore})
             ORDER BY id ASC
             LIMIT #{limit}
            """)
    List<WorkflowTerminalNotificationOutbox> selectDue(@Param("now") LocalDateTime now,
                                                       @Param("staleBefore") LocalDateTime staleBefore,
                                                       @Param("limit") int limit);

    @Update("""
            UPDATE af_workflow_notification_outbox
               SET status = 'DISPATCHING', attempt_count = attempt_count + 1, updated_at = #{now}
             WHERE id = #{id}
               AND ((status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                 OR (status = 'DISPATCHING' AND updated_at <= #{staleBefore}))
            """)
    int claim(@Param("id") Long id,
              @Param("now") LocalDateTime now,
              @Param("staleBefore") LocalDateTime staleBefore);

    @Update("""
            UPDATE af_workflow_notification_outbox
               SET status = 'DISPATCHED', published_at = #{publishedAt}, last_error = NULL, updated_at = #{publishedAt}
             WHERE id = #{id} AND status = 'DISPATCHING'
            """)
    int markDispatched(@Param("id") Long id, @Param("publishedAt") LocalDateTime publishedAt);

    @Update("""
            UPDATE af_workflow_notification_outbox
               SET status = 'PENDING', next_attempt_at = #{nextAttemptAt}, last_error = #{lastError}, updated_at = #{now}
             WHERE id = #{id} AND status = 'DISPATCHING'
            """)
    int markRetry(@Param("id") Long id,
                  @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                  @Param("lastError") String lastError,
                  @Param("now") LocalDateTime now);
}
