package com.aetherflow.file.db;

import com.aetherflow.file.entity.FileInfo;
import com.aetherflow.file.mapper.FileInfoMapper;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Update;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class GeneratedArtifactMapperSqlContractTest {

    @Test
    void reservationsClaimsAndBatchCommitUseDatabaseClockAndFencing() throws Exception {
        String insert = insertSql("insertGeneratedArtifactReservation", FileInfo.class, long.class);
        String claim = updateSql("claimGeneratedArtifact", FileInfo.class, String.class, long.class);
        String stage = updateSql("completeGeneratedArtifactStage", Long.class, String.class);
        String commit = updateSql("commitGeneratedArtifactBatch", Long.class, Long.class, String.class);

        assertThat(insert).contains("'UPLOADING'", "CURRENT_TIMESTAMP(6)", "#{file.producerFenceToken}");
        assertThat(claim).contains("claim_expires_at <= CURRENT_TIMESTAMP(6)",
                "producer_fence_token = #{file.producerFenceToken}", "file_hash = #{file.hash}");
        assertThat(stage).contains("status = 'STAGED'", "claim_token = #{claimToken}");
        assertThat(commit).contains("status = 'AVAILABLE'", "status = 'STAGED'", "artifact_batch_id = #{artifactBatchId}");
    }

    private String insertSql(String name, Class<?>... parameterTypes) throws Exception {
        Method method = FileInfoMapper.class.getMethod(name, parameterTypes);
        return String.join(" ", method.getAnnotation(Insert.class).value());
    }

    private String updateSql(String name, Class<?>... parameterTypes) throws Exception {
        Method method = FileInfoMapper.class.getMethod(name, parameterTypes);
        return String.join(" ", method.getAnnotation(Update.class).value());
    }
}
