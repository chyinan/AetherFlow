package com.aetherflow.ai.outbox;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Delete;

import java.time.LocalDateTime;

// pattern: Imperative Shell
public interface AiTaskEventOutboxMapper extends BaseMapper<AiTaskEventOutbox> {

    @Update("""
            UPDATE af_ai_task_event_outbox
            SET status = 'PROCESSING',
                lease_token = #{leaseToken},
                updated_at = #{now}
            WHERE id = #{id}
              AND (
                    (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                    OR (status = 'PROCESSING' AND updated_at <= #{staleBefore})
                  )
            """)
    int claimForPublishing(@Param("id") Long id,
                           @Param("leaseToken") String leaseToken,
                           @Param("now") LocalDateTime now,
                           @Param("staleBefore") LocalDateTime staleBefore);

    @Update("""
            UPDATE af_ai_task_event_outbox
               SET status = 'PUBLISHED', published_at = #{publishedAt},
                   lease_token = NULL, last_error = NULL, updated_at = #{publishedAt}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int markPublishedOwned(@Param("id") Long id,
                           @Param("leaseToken") String leaseToken,
                           @Param("publishedAt") LocalDateTime publishedAt);

    @Update("""
            UPDATE af_ai_task_event_outbox
               SET status = 'PENDING', next_attempt_at = #{nextAttemptAt},
                   attempt_count = #{attemptCount}, last_error = #{lastError},
                   lease_token = NULL, updated_at = #{now}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int markRetryOwned(@Param("id") Long id,
                       @Param("leaseToken") String leaseToken,
                       @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                       @Param("attemptCount") int attemptCount,
                       @Param("lastError") String lastError,
                       @Param("now") LocalDateTime now);

    @Delete("""
            DELETE FROM af_ai_task_event_outbox
             WHERE status = 'PUBLISHED' AND published_at < #{before}
             LIMIT #{limit}
            """)
    int deletePublishedBefore(@Param("before") LocalDateTime before, @Param("limit") int limit);
}
