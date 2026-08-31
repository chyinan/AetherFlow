package com.aetherflow.task.mapper;

import com.aetherflow.task.entity.Task;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

public interface TaskMapper extends BaseMapper<Task> {

    @Update("""
            UPDATE af_task_record
               SET status = #{targetStatus}, next_retry_at = #{nextRetryAt}, updated_at = #{updatedAt}
             WHERE id = #{taskId} AND status = #{expectedStatus}
            """)
    int updateStatusIfCurrent(@Param("taskId") Long taskId,
                              @Param("expectedStatus") String expectedStatus,
                              @Param("targetStatus") String targetStatus,
                              @Param("nextRetryAt") LocalDateTime nextRetryAt,
                              @Param("updatedAt") LocalDateTime updatedAt);
}
