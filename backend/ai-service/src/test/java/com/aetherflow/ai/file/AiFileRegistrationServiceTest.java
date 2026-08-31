package com.aetherflow.ai.file;

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.config.FileClientProperties;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.task.AiJobLease;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.security.InternalServiceTokenService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiFileRegistrationServiceTest {

    @Test
    void storesGeneratedArtifactsWithTenantAndIdempotencyContext() {
        FileClient fileClient = mock(FileClient.class);
        FileClientProperties properties = new FileClientProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        AiFileRegistrationService service = new AiFileRegistrationService(fileClient, properties);
        when(fileClient.storeGeneratedArtifact(any(String.class), any(CreateGeneratedFileRequestDTO.class)))
                .thenReturn(Result.success(new FileMetadataDTO()));

        TaskMessageDTO task = new TaskMessageDTO();
        task.setTaskId(77L);
        task.setWorkflowInstanceId(2002L);
        task.setUserId(1001L);
        task.setNodeId("node-whisper");

        byte[] subtitle = "1\n00:00:00,000 --> 00:00:01,000\nhello\n".getBytes(StandardCharsets.UTF_8);
        ArtifactRegistrationResult registration = service.registerArtifacts(
                task,
                new AiJobLease(3003L, "lease-token-1", LocalDateTime.now().plusMinutes(2)),
                List.of(new AiArtifact("SRT", "transcription.srt", "text/plain", subtitle)));

        ArgumentCaptor<CreateGeneratedFileRequestDTO> requestCaptor =
                ArgumentCaptor.forClass(CreateGeneratedFileRequestDTO.class);
        ArgumentCaptor<String> tokenCaptor = ArgumentCaptor.forClass(String.class);
        verify(fileClient).storeGeneratedArtifact(tokenCaptor.capture(), requestCaptor.capture());
        assertThat(new InternalServiceTokenService(
                "0123456789abcdef0123456789abcdef", "aetherflow-internal", Duration.ofMinutes(1))
                .isValid(tokenCaptor.getValue(), "file-service", Instant.now())).isTrue();
        CreateGeneratedFileRequestDTO request = requestCaptor.getValue();
        assertThat(request.getUserId()).isEqualTo(1001L);
        assertThat(request.getAiJobId()).isEqualTo(3003L);
        assertThat(request.getTaskId()).isEqualTo(77L);
        assertThat(request.getLeaseToken()).isEqualTo("lease-token-1");
        assertThat(request.getArtifactBatchId()).isEqualTo("ai-task:77:node-whisper:artifacts");
        assertThat(request.getArtifactOrdinal()).isZero();
        assertThat(request.getWorkflowId()).isEqualTo("2002");
        assertThat(request.getSource()).isEqualTo("artifact");
        assertThat(request.getArtifactKind()).isEqualTo("subtitle");
        assertThat(request.getOriginalName()).isEqualTo("transcription.srt");
        assertThat(request.getContentType()).isEqualTo("text/plain");
        assertThat(request.getIdempotencyKey()).isEqualTo("ai-task:77:node-whisper:SRT:0");
        assertThat(Base64.getDecoder().decode(request.getContentBase64())).isEqualTo(subtitle);
        assertThat(registration.batchId()).isEqualTo("ai-task:77:node-whisper:artifacts");
        assertThat(registration.expectedCount()).isEqualTo(1);
        assertThat(registration.files()).hasSize(1);
    }

    @Test
    void rejectsEmptyArtifactsInsteadOfCompressingOrdinalMapping() {
        FileClient fileClient = mock(FileClient.class);
        AiFileRegistrationService service = new AiFileRegistrationService(fileClient, new FileClientProperties());
        TaskMessageDTO task = new TaskMessageDTO();
        task.setTaskId(77L);
        task.setWorkflowInstanceId(2002L);
        task.setUserId(1001L);
        task.setNodeId("node-whisper");

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.registerArtifacts(
                        task,
                        new AiJobLease(3003L, "lease-token-1", LocalDateTime.now().plusMinutes(2)),
                        List.of(new AiArtifact("SRT", "empty.srt", "text/plain", new byte[0]))))
                .isInstanceOf(com.aetherflow.common.exception.BusinessException.class)
                .hasMessageContaining("content is empty");
        verify(fileClient, never()).storeGeneratedArtifact(any(), any());
    }
}
