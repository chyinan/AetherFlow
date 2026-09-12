package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

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

    @Update("""
            UPDATE af_workflow_definition
               SET name = #{name}, description = #{description}, project_id = #{projectId},
                   definition_json = #{definitionJson}, version = #{version}, updated_at = #{updatedAt}
             WHERE id = #{id} AND owner_user_id = #{ownerUserId}
               AND version = #{expectedVersion} AND status <> 'DELETED'
            """)
    int updateVersioned(@Param("id") Long id,
                        @Param("ownerUserId") Long ownerUserId,
                        @Param("name") String name,
                        @Param("description") String description,
                        @Param("projectId") Long projectId,
                        @Param("definitionJson") String definitionJson,
                        @Param("version") Integer version,
                        @Param("expectedVersion") Integer expectedVersion,
                        @Param("updatedAt") java.time.LocalDateTime updatedAt);
}

