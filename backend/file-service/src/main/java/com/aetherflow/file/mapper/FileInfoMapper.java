package com.aetherflow.file.mapper;

// pattern: Imperative Shell

import com.aetherflow.file.entity.FileInfo;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

public interface FileInfoMapper extends BaseMapper<FileInfo> {

    @Select("""
            SELECT *
            FROM af_file_info
            WHERE user_id = #{userId}
              AND idempotency_key = #{idempotencyKey}
            LIMIT 1
            """)
    FileInfo selectGeneratedByIdempotency(@Param("userId") Long userId,
                                          @Param("idempotencyKey") String idempotencyKey);

    @Insert("""
            INSERT INTO af_file_info (
                user_id, uploader_id, source, artifact_kind, workflow_id, idempotency_key,
                ai_job_id, task_id, artifact_batch_id, artifact_ordinal, producer_fence_token,
                claim_token, claim_expires_at, bucket, object_key, original_name, content_type,
                mime_type, file_hash, file_size, file_url, status, upload_duration, created_at, updated_at
            ) VALUES (
                #{file.userId}, #{file.uploaderId}, #{file.source}, #{file.artifactKind}, #{file.workflowId},
                #{file.idempotencyKey}, #{file.aiJobId}, #{file.taskId}, #{file.artifactBatchId},
                #{file.artifactOrdinal}, #{file.producerFenceToken}, #{file.claimToken},
                DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL #{claimMicros} MICROSECOND),
                #{file.bucket}, #{file.objectKey}, #{file.originalName}, #{file.contentType}, #{file.mimeType},
                #{file.hash}, #{file.fileSize}, #{file.fileUrl}, 'UPLOADING', #{file.uploadDuration},
                CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6)
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "file.id")
    int insertGeneratedArtifactReservation(@Param("file") FileInfo file,
                                           @Param("claimMicros") long claimMicros);

    @Update("""
            UPDATE af_file_info
            SET status = 'UPLOADING',
                producer_fence_token = #{file.producerFenceToken},
                claim_token = #{claimToken},
                claim_expires_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL #{claimMicros} MICROSECOND),
                artifact_batch_id = #{file.artifactBatchId},
                artifact_ordinal = #{file.artifactOrdinal},
                original_name = #{file.originalName},
                content_type = #{file.contentType},
                mime_type = #{file.mimeType},
                file_hash = #{file.hash},
                file_size = #{file.fileSize},
                object_key = #{file.objectKey},
                file_url = #{file.fileUrl},
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{file.id}
              AND (
                    status = 'FAILED'
                    OR status = 'STAGED'
                    OR (status = 'UPLOADING' AND claim_expires_at <= CURRENT_TIMESTAMP(6))
              )
            """)
    int claimGeneratedArtifact(@Param("file") FileInfo file,
                               @Param("claimToken") String claimToken,
                               @Param("claimMicros") long claimMicros);

    @Update("""
            UPDATE af_file_info
            SET status = 'STAGED',
                claim_token = NULL,
                claim_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status IN ('UPLOADING', 'STAGED')
              AND claim_token = #{claimToken}
              AND claim_expires_at >= CURRENT_TIMESTAMP(6)
            """)
    int completeGeneratedArtifactStage(@Param("id") Long id, @Param("claimToken") String claimToken);

    @Update("""
            UPDATE af_file_info
            SET status = 'FAILED',
                claim_token = NULL,
                claim_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status = 'UPLOADING'
              AND claim_token = #{claimToken}
            """)
    int failGeneratedArtifactClaim(@Param("id") Long id, @Param("claimToken") String claimToken);

    @Update("""
            UPDATE af_file_info
            SET status = 'FAILED', claim_token = NULL, claim_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE id = #{id}
              AND status = 'STAGED'
            """)
    int expireStagedGeneratedArtifact(@Param("id") Long id);

    @Update("""
            UPDATE af_file_info
            SET status = 'FAILED', claim_token = NULL, claim_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP(6)
            WHERE user_id = #{userId}
              AND ai_job_id = #{aiJobId}
              AND artifact_batch_id = #{artifactBatchId}
              AND status IN ('UPLOADING', 'STAGED')
            """)
    int abortGeneratedArtifactBatch(@Param("userId") Long userId,
                                    @Param("aiJobId") Long aiJobId,
                                    @Param("artifactBatchId") String artifactBatchId);

    @Update("""
            UPDATE af_file_info
            SET status = 'AVAILABLE', updated_at = CURRENT_TIMESTAMP(6)
            WHERE user_id = #{userId}
              AND ai_job_id = #{aiJobId}
              AND artifact_batch_id = #{artifactBatchId}
              AND status = 'STAGED'
            """)
    int commitGeneratedArtifactBatch(@Param("userId") Long userId,
                                     @Param("aiJobId") Long aiJobId,
                                     @Param("artifactBatchId") String artifactBatchId);

    @Select("""
            SELECT * FROM af_file_info
            WHERE user_id = #{userId}
              AND ai_job_id = #{aiJobId}
              AND artifact_batch_id = #{artifactBatchId}
              AND status IN ('UPLOADING', 'STAGED', 'AVAILABLE')
            ORDER BY artifact_ordinal ASC, id ASC
            """)
    List<FileInfo> selectGeneratedArtifactBatch(@Param("userId") Long userId,
                                                @Param("aiJobId") Long aiJobId,
                                                @Param("artifactBatchId") String artifactBatchId);

    @Select("""
            SELECT * FROM af_file_info
            WHERE user_id = #{userId}
              AND ai_job_id = #{aiJobId}
              AND artifact_batch_id = #{artifactBatchId}
              AND status IN ('UPLOADING', 'STAGED')
            ORDER BY artifact_ordinal ASC, id ASC
            """)
    List<FileInfo> selectGeneratedArtifactBatchForAbort(@Param("userId") Long userId,
                                                        @Param("aiJobId") Long aiJobId,
                                                        @Param("artifactBatchId") String artifactBatchId);

    @Select("""
            SELECT * FROM af_file_info
            WHERE source = 'artifact'
              AND artifact_batch_id IS NOT NULL
              AND status = 'UPLOADING'
              AND updated_at <= DATE_SUB(CURRENT_TIMESTAMP(6), INTERVAL #{staleMicros} MICROSECOND)
            ORDER BY updated_at ASC, id ASC
            LIMIT #{limit}
            """)
    List<FileInfo> selectStaleGeneratedArtifacts(@Param("staleMicros") long staleMicros,
                                                 @Param("limit") int limit);

    @Update("""
            UPDATE af_file_info
            SET status = #{targetStatus}, updated_at = #{updatedAt}
            WHERE id = #{id}
              AND status = #{expectedStatus}
            """)
    int updateGeneratedArtifactStatus(@Param("id") Long id,
                                      @Param("expectedStatus") String expectedStatus,
                                      @Param("targetStatus") String targetStatus,
                                      @Param("updatedAt") LocalDateTime updatedAt);

    @Select("""
            SELECT *
            FROM af_file_info
            WHERE file_hash = #{hash}
              AND status = 'AVAILABLE'
            ORDER BY id ASC
            LIMIT 1
            """)
    FileInfo selectFirstAvailableByHash(@Param("hash") String hash);

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status = 'AVAILABLE'
            """)
    Long countAvailableFiles();

    @Select("""
            SELECT COALESCE(SUM(t.file_size), 0)
            FROM (
                SELECT MAX(file_size) AS file_size
                FROM af_file_info
                WHERE status = 'AVAILABLE'
                GROUP BY bucket, object_key
            ) t
            """)
    Long sumPhysicalStorageSize();

    @Select("""
            SELECT CAST(COALESCE(AVG(upload_duration), 0) AS SIGNED)
            FROM af_file_info
            WHERE upload_duration IS NOT NULL
              AND upload_duration >= 0
            """)
    Long averageUploadDurationMs();

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status = 'AVAILABLE'
              AND file_hash = #{hash}
            """)
    Long countAvailableByHash(@Param("hash") String hash);

    @Select("""
            SELECT COUNT(1)
            FROM af_file_info
            WHERE status IN ('AVAILABLE', 'STAGED', 'UPLOADING')
              AND bucket = #{bucket}
              AND object_key = #{objectKey}
            """)
    Long countAvailableByObject(@Param("bucket") String bucket, @Param("objectKey") String objectKey);
}
