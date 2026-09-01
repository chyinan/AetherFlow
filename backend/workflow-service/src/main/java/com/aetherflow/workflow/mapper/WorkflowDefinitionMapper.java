package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface WorkflowDefinitionMapper extends BaseMapper<WorkflowDefinition> {

    @Select("""
            SELECT * FROM af_workflow_definition
             WHERE owner_user_id = #{ownerUserId} AND idempotency_key = #{idempotencyKey}
             ORDER BY id ASC
             LIMIT 1
            """)
    WorkflowDefinition findByOwnerUserIdAndIdempotencyKey(@Param("ownerUserId") Long ownerUserId,
                                                          @Param("idempotencyKey") String idempotencyKey);

    @Insert("""
            INSERT INTO af_workflow_definition
                (name, description, project_id, owner_user_id, owner_name, idempotency_key,
                 definition_json, version, status, created_at, updated_at)
            VALUES
                (#{name}, #{description}, #{projectId}, #{ownerUserId}, #{ownerName}, #{idempotencyKey},
                 #{definitionJson}, #{version}, #{status}, #{createdAt}, #{updatedAt})
            ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id", keyColumn = "id")
    int insertIdempotent(WorkflowDefinition definition);
}

