package com.aetherflow.workflow.mapper;

// pattern: Imperative Shell

import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshotEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface WorkflowRuntimeSnapshotMapper extends BaseMapper<WorkflowRuntimeSnapshotEntity> {

    @Select("""
            SELECT s.*
              FROM af_workflow_runtime_snapshot s
              LEFT JOIN af_workflow_instance i
                ON i.id = CAST(s.workflow_id AS UNSIGNED)
             WHERE s.runtime_state IN ('SUCCESS', 'FAILED', 'CANCELLED')
               AND (
                    i.id IS NULL
                    OR i.status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
                    OR NOT EXISTS (
                        SELECT 1
                         FROM af_workflow_notification_outbox n
                         WHERE n.workflow_instance_id = CAST(s.workflow_id AS UNSIGNED)
                           AND BINARY n.event_id = BINARY CONCAT('workflow:', s.workflow_id, ':', s.runtime_state)
                    )
               )
             ORDER BY s.updated_at ASC, s.id ASC
             LIMIT #{limit}
            """)
    List<WorkflowRuntimeSnapshotEntity> selectTerminalNeedingReconciliation(@Param("limit") int limit);

    @Update("""
            UPDATE af_workflow_runtime_snapshot
               SET fencing_token = #{fencingToken}
             WHERE workflow_id = #{workflowId}
               AND runtime_state NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
               AND ((fencing_token IS NULL AND #{expectedFencingToken} IS NULL)
                    OR fencing_token = #{expectedFencingToken})
            """)
    int claimForLease(@Param("workflowId") String workflowId,
                      @Param("expectedFencingToken") String expectedFencingToken,
                      @Param("fencingToken") String fencingToken);

    @Update("""
            UPDATE af_workflow_runtime_snapshot
            SET runtime_state = 'CANCELLED', updated_at = CURRENT_TIMESTAMP(6)
            WHERE workflow_id = #{workflowId}
              AND runtime_state <> 'CANCELLED'
            """)
    int markCancelled(@Param("workflowId") String workflowId);

    @Update("""
            UPDATE af_workflow_runtime_snapshot
             SET trace_id = #{traceId}, task_id = #{taskId}, definition_id = #{definitionId},
                 definition_json = #{definitionJson}, runtime_state = #{runtimeState},
                 current_node_ids_json = #{currentNodeIdsJson}, completed_node_ids_json = #{completedNodeIdsJson},
                 failed_node_ids_json = #{failedNodeIdsJson}, variables_json = #{variablesJson},
                 node_outputs_json = #{nodeOutputsJson}, updated_at = #{updatedAt}
             WHERE id = #{id} AND runtime_state <> 'CANCELLED'
             """)
    int updateIfNotCancelled(WorkflowRuntimeSnapshotEntity entity);

    @Update("""
            UPDATE af_workflow_runtime_snapshot
               SET trace_id = #{traceId}, task_id = #{taskId}, definition_id = #{definitionId},
                   definition_json = #{definitionJson}, runtime_state = #{runtimeState},
                   current_node_ids_json = #{currentNodeIdsJson}, completed_node_ids_json = #{completedNodeIdsJson},
                   failed_node_ids_json = #{failedNodeIdsJson}, variables_json = #{variablesJson},
                   node_outputs_json = #{nodeOutputsJson}, updated_at = #{updatedAt}
             WHERE id = #{id}
               AND fencing_token = #{fencingToken}
               AND (runtime_state <> 'CANCELLED' OR #{runtimeState} = 'CANCELLED')
            """)
    int updateIfOwned(WorkflowRuntimeSnapshotEntity entity);
}
