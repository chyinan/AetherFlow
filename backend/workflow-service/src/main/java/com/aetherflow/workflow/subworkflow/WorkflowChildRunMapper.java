package com.aetherflow.workflow.subworkflow;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import java.time.LocalDateTime;
import java.util.List;

public interface WorkflowChildRunMapper extends BaseMapper<WorkflowChildRun> {
    @Select("""
        SELECT * FROM af_workflow_child_run
        WHERE parent_instance_id = #{parentId} AND invocation_key = #{key}
        """)
    WorkflowChildRun findInvocation(@Param("parentId") Long parentId, @Param("key") String key);

    @Select("""
        SELECT * FROM af_workflow_child_run
        WHERE status = 'WAITING' AND next_attempt_at <= #{now}
        ORDER BY next_attempt_at, id LIMIT #{limit}
        """)
    List<WorkflowChildRun> due(@Param("now") LocalDateTime now, @Param("limit") int limit);

    @Select("""
        SELECT * FROM af_workflow_child_run
        WHERE parent_instance_id = #{parentId} AND owner_user_id = #{userId} ORDER BY id
        """)
    List<WorkflowChildRun> listOwned(@Param("parentId") Long parentId, @Param("userId") Long userId);

    @Select("""
        SELECT * FROM af_workflow_child_run
        WHERE child_instance_id = #{childId} AND owner_user_id = #{userId}
        """)
    WorkflowChildRun findChildOwned(@Param("childId") Long childId, @Param("userId") Long userId);

    @Update("""
        UPDATE af_workflow_child_run SET status = #{status}, updated_at = #{now}, next_attempt_at = #{next}
        WHERE id = #{id} AND status = 'WAITING'
        """)
    int recordAttempt(@Param("id") Long id, @Param("status") String status,
                      @Param("now") LocalDateTime now, @Param("next") LocalDateTime next);
}
