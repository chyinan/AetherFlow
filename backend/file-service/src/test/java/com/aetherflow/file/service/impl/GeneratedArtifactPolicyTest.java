package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeneratedArtifactPolicyTest {

    @Test
    void preparesDeterministicTenantScopedObjectKeyAndContentHash() {
        CreateGeneratedFileRequestDTO request = request();

        var prepared = GeneratedArtifactPolicy.prepare(request, 1024);

        assertThat(prepared.content()).isEqualTo("subtitle".getBytes(StandardCharsets.UTF_8));
        assertThat(prepared.sha256()).hasSize(64);
        assertThat(prepared.objectKey()).startsWith("workflow/exports/2002/users/1001/generated/");
        assertThat(prepared.objectKey()).endsWith("-transcription.srt");
        assertThat(GeneratedArtifactPolicy.prepare(request, 1024).objectKey()).isEqualTo(prepared.objectKey());
    }

    @Test
    void isolatesPhysicalObjectKeysAcrossTenants() {
        CreateGeneratedFileRequestDTO firstTenant = request();
        CreateGeneratedFileRequestDTO secondTenant = request();
        secondTenant.setUserId(2002L);

        var first = GeneratedArtifactPolicy.prepare(firstTenant, 1024);
        var second = GeneratedArtifactPolicy.prepare(secondTenant, 1024);

        assertThat(first.objectKey()).isNotEqualTo(second.objectKey());
        assertThat(first.objectKey()).contains("/users/1001/");
        assertThat(second.objectKey()).contains("/users/2002/");
    }

    @Test
    void rejectsGeneratedArtifactWithoutSupportedClassification() {
        CreateGeneratedFileRequestDTO request = request();
        request.setSource("AI");

        assertThatThrownBy(() -> GeneratedArtifactPolicy.prepare(request, 1024))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST));
    }

    @Test
    void rejectsGeneratedArtifactBeyondConfiguredDecodedSize() {
        CreateGeneratedFileRequestDTO request = request();

        assertThatThrownBy(() -> GeneratedArtifactPolicy.prepare(request, 2))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.BAD_REQUEST));
    }

    private CreateGeneratedFileRequestDTO request() {
        CreateGeneratedFileRequestDTO request = new CreateGeneratedFileRequestDTO();
        request.setUserId(1001L);
        request.setAiJobId(3003L);
        request.setTaskId(77L);
        request.setLeaseToken("lease-token-1");
        request.setArtifactBatchId("ai-task:77:node-whisper:artifacts");
        request.setArtifactOrdinal(0);
        request.setIdempotencyKey("ai-task:77:node-whisper:SRT:0");
        request.setWorkflowId("2002");
        request.setSource("artifact");
        request.setArtifactKind("subtitle");
        request.setOriginalName("transcription.srt");
        request.setContentType("text/plain");
        request.setContentBase64(Base64.getEncoder().encodeToString("subtitle".getBytes(StandardCharsets.UTF_8)));
        return request;
    }
}
