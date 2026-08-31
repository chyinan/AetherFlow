package com.aetherflow.workflow.mapper;

import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshotEntity;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Param;

public interface WorkflowRuntimeSnapshotMapper extends BaseMapper<WorkflowRuntimeSnapshotEntity> {

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
}
