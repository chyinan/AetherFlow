package com.aetherflow.ai.outbox;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

// pattern: Imperative Shell
public interface AiTaskEventOutboxMapper extends BaseMapper<AiTaskEventOutbox> {

    @Update("""
            UPDATE af_ai_task_event_outbox
            SET status = 'PROCESSING',
                updated_at = #{now}
            WHERE id = #{id}
              AND (
                    (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= #{now}))
                    OR (status = 'PROCESSING' AND updated_at <= #{staleBefore})
                  )
            """)
    int claimForPublishing(@Param("id") Long id,
                           @Param("now") LocalDateTime now,
                           @Param("staleBefore") LocalDateTime staleBefore);
}
