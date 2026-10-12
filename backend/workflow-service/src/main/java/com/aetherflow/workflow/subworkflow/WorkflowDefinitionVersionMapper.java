package com.aetherflow.workflow.subworkflow;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import java.util.List;

public interface WorkflowDefinitionVersionMapper extends BaseMapper<WorkflowDefinitionVersion> {
    @Insert("""
        INSERT INTO af_workflow_definition_version
            (definition_id, version, owner_user_id, definition_json, created_at)
        VALUES (#{definitionId}, #{version}, #{ownerUserId}, #{definitionJson}, #{createdAt})
        ON DUPLICATE KEY UPDATE id = id
        """)
    int insertImmutable(WorkflowDefinitionVersion version);

    @Select("""
        SELECT * FROM af_workflow_definition_version
        WHERE definition_id = #{definitionId} AND version = #{version} AND owner_user_id = #{userId}
        """)
    WorkflowDefinitionVersion findOwned(@Param("definitionId") Long definitionId,
                                       @Param("version") int version, @Param("userId") Long userId);

    @Select("""
        SELECT * FROM af_workflow_definition_version
        WHERE definition_id = #{definitionId} AND owner_user_id = #{userId}
        ORDER BY version DESC
        """)
    List<WorkflowDefinitionVersion> listOwned(@Param("definitionId") Long definitionId, @Param("userId") Long userId);
}
