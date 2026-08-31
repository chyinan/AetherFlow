package com.aetherflow.ai.mapper;

// pattern: Imperative Shell

import com.aetherflow.ai.entity.AiJob;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Select;

public interface AiJobMapper extends BaseMapper<AiJob> {

    @Select("""
            SELECT * FROM af_ai_job
            WHERE user_id = #{userId}
              AND idempotency_key = #{idempotencyKey}
            LIMIT 1
            """)
    AiJob selectByIdempotencyKey(@Param("userId") Long userId,
                                 @Param("idempotencyKey") String idempotencyKey);

    /** Backward-compatible legacy scope for internal jobs that predate user propagation. */
    @Deprecated
    default AiJob selectByIdempotencyKey(String idempotencyKey) {
        return selectByIdempotencyKey(0L, idempotencyKey);
    }

    @Select("""
            SELECT COUNT(1) > 0
            FROM af_ai_job
            WHERE id = #{aiJobId}
              AND task_id = #{taskId}
              AND user_id = #{userId}
              AND workflow_instance_id = #{workflowInstanceId}
              AND (
                    (#{operation} = 'STAGE' AND status = 'RUNNING'
                        AND lease_token = #{leaseToken}
                        AND lease_expires_at >= CURRENT_TIMESTAMP(6))
                    OR (#{operation} = 'COMMIT' AND status = 'SUCCEEDED')
                    OR (#{operation} = 'ABORT' AND status = 'FAILED')
              )
            """)
    boolean validateArtifactAuthority(@Param("userId") Long userId,
                                      @Param("aiJobId") Long aiJobId,
                                      @Param("taskId") Long taskId,
                                      @Param("workflowInstanceId") Long workflowInstanceId,
                                      @Param("leaseToken") String leaseToken,
                                      @Param("operation") String operation);

    @Insert("""
            INSERT INTO af_ai_job (
                task_id, user_id, idempotency_key, workflow_instance_id, job_type,
                input_json, output_json, status, lease_token, lease_expires_at,
                last_heartbeat_at, attempt_count, started_at, completed_at, updated_at
            ) VALUES (
                #{job.taskId}, #{job.userId}, #{job.idempotencyKey}, #{job.workflowInstanceId}, #{job.jobType},
                #{job.inputJson}, NULL, 'RUNNING', #{job.leaseToken},
                DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL #{leaseMicros} MICROSECOND),
                CURRENT_TIMESTAMP(6), 1, CURRENT_TIMESTAMP(6), NULL, CURRENT_TIMESTAMP(6)
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "job.id")
    int insertAiJobWithLease(@Param("job") AiJob job, @Param("leaseMicros") long leaseMicros);

    @Update("""
            UPDATE af_ai_job
            SET status = 'RUNNING',
                lease_token = #{leaseToken},
                lease_expires_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL #{leaseMicros} MICROSECOND),
                last_heartbeat_at = CURRENT_TIMESTAMP(6),
                attempt_count = attempt_count + 1,
                completed_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND (
                    status = 'RETRYING'
                    OR (status = 'RUNNING' AND (lease_expires_at IS NULL OR lease_expires_at <= CURRENT_TIMESTAMP(6)))
              )
            """)
    int claimAiJobLease(@Param("id") Long id,
                        @Param("leaseToken") String leaseToken,
                        @Param("leaseMicros") long leaseMicros);

    @Update("""
            UPDATE af_ai_job
            SET lease_expires_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL #{leaseMicros} MICROSECOND),
                last_heartbeat_at = CURRENT_TIMESTAMP(6),
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status = 'RUNNING'
              AND lease_token = #{leaseToken}
              AND lease_expires_at >= CURRENT_TIMESTAMP(6)
            """)
    int renewAiJobLease(@Param("id") Long id,
                        @Param("leaseToken") String leaseToken,
                        @Param("leaseMicros") long leaseMicros);

    @Update("""
            UPDATE af_ai_job
            SET status = #{targetStatus},
                output_json = #{outputJson},
                completed_at = CURRENT_TIMESTAMP(6),
                updated_at = CURRENT_TIMESTAMP(6),
                lease_token = NULL,
                lease_expires_at = NULL,
                last_heartbeat_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status = 'RUNNING'
              AND lease_token = #{leaseToken}
              AND lease_expires_at >= CURRENT_TIMESTAMP(6)
            """)
    int completeAiJobWithLease(@Param("id") Long id,
                               @Param("leaseToken") String leaseToken,
                               @Param("targetStatus") String targetStatus,
                               @Param("outputJson") String outputJson);

    @Update("""
            UPDATE af_ai_job
            SET status = 'RETRYING',
                output_json = #{outputJson},
                completed_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6),
                lease_token = NULL,
                lease_expires_at = NULL,
                last_heartbeat_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status = 'RUNNING'
              AND lease_token = #{leaseToken}
              AND lease_expires_at >= CURRENT_TIMESTAMP(6)
            """)
    int markAiJobRetryingWithLease(@Param("id") Long id,
                                   @Param("leaseToken") String leaseToken,
                                   @Param("outputJson") String outputJson);
}

