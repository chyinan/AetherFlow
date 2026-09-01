package com.aetherflow.workflow.knowledge.ingestion;

// pattern: Imperative Shell

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

// pattern: Imperative Shell
public interface KnowledgeIngestionJobMapper extends BaseMapper<KnowledgeIngestionJobEntity> {

    @Update("""
            UPDATE af_knowledge_ingestion_job
            SET status = 'PROCESSING', lease_token = UUID(), updated_at = #{now}
            WHERE id = #{id}
              AND status = 'PENDING'
              AND (next_attempt_at IS NULL OR next_attempt_at <= #{now})
            """)
    int claim(@Param("id") Long id, @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_knowledge_ingestion_job
            SET status = 'PENDING', lease_token = NULL, next_attempt_at = #{now}, updated_at = #{now}
            WHERE status = 'PROCESSING' AND updated_at <= #{staleBefore}
            """)
    int requeueStale(@Param("staleBefore") LocalDateTime staleBefore,
                     @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_knowledge_ingestion_job
            SET status = 'PENDING', next_attempt_at = #{now}, updated_at = #{now}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int release(@Param("id") Long id, @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_knowledge_ingestion_job
               SET status = 'PENDING', lease_token = NULL, next_attempt_at = #{now}, updated_at = #{now}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int releaseOwned(@Param("id") Long id,
                     @Param("leaseToken") String leaseToken,
                     @Param("now") LocalDateTime now);

    @Update("""
            UPDATE af_knowledge_ingestion_job
            SET status = #{status}, attempt_count = #{attemptCount},
                next_attempt_at = #{nextAttemptAt}, last_error = #{lastError}, updated_at = #{updatedAt}
            WHERE id = #{id} AND status = 'PROCESSING'
            """)
    int finishAttempt(@Param("id") Long id,
                      @Param("status") String status,
                      @Param("attemptCount") int attemptCount,
                      @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                      @Param("lastError") String lastError,
                      @Param("updatedAt") LocalDateTime updatedAt);

    @Update("""
            UPDATE af_knowledge_ingestion_job
               SET status = #{status}, attempt_count = #{attemptCount}, lease_token = NULL,
                   next_attempt_at = #{nextAttemptAt}, last_error = #{lastError}, updated_at = #{updatedAt}
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int finishAttemptWithLease(@Param("id") Long id,
                               @Param("leaseToken") String leaseToken,
                               @Param("status") String status,
                               @Param("attemptCount") int attemptCount,
                               @Param("nextAttemptAt") LocalDateTime nextAttemptAt,
                               @Param("lastError") String lastError,
                               @Param("updatedAt") LocalDateTime updatedAt);

    @org.apache.ibatis.annotations.Select("""
            SELECT COUNT(1) FROM af_knowledge_ingestion_job
             WHERE id = #{id} AND status = 'PROCESSING' AND lease_token = #{leaseToken}
            """)
    int isLeaseOwner(@Param("id") Long id, @Param("leaseToken") String leaseToken);

    @Delete("DELETE FROM af_knowledge_ingestion_job WHERE document_id = #{documentId}")
    int deleteByDocumentId(@Param("documentId") Long documentId);
}
