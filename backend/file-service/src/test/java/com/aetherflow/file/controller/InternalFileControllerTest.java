package com.aetherflow.file.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import com.aetherflow.file.config.FileInternalProperties;
import com.aetherflow.file.service.FileDownload;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ResponseEntity;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class InternalFileControllerTest {

    @Test
    void rejectsMetadataCreationWhenInternalTokenDoesNotMatch() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);

        assertThatThrownBy(() -> controller.createMetadata("wrong-token", validRequest()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(fileInfoService);
    }

    @Test
    void createsMetadataWhenInternalTokenMatches() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        CreateFileMetadataRequestDTO request = validRequest();
        FileMetadataDTO metadata = new FileMetadataDTO(
                1L,
                "aetherflow",
                "outputs/demo.txt",
                "demo.txt",
                "text/plain",
                16L,
                "http://minio/aetherflow/outputs/demo.txt"
        );
        request.setUserId(1001L);
        when(fileInfoService.createMetadata(1001L, request)).thenReturn(metadata);

        Result<FileMetadataDTO> result = controller.createMetadata(fileToken(), request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(metadata);
        verify(fileInfoService).createMetadata(1001L, request);
    }

    @Test
    void storesGeneratedArtifactOnlyAfterInternalTokenValidation() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        CreateGeneratedFileRequestDTO request = generatedArtifactRequest();
        FileMetadataDTO metadata = new FileMetadataDTO(
                8L, "aetherflow", "workflow/exports/2002/generated/transcription.srt",
                "transcription.srt", "text/plain", 16L, "https://files.example/transcription.srt"
        );
        when(fileInfoService.storeGeneratedArtifact(request)).thenReturn(metadata);

        Result<FileMetadataDTO> result = controller.storeGeneratedArtifact(fileToken(), request);

        assertThat(result.getData()).isSameAs(metadata);
        verify(fileInfoService).storeGeneratedArtifact(request);
    }

    @Test
    void rejectsGeneratedArtifactWhenInternalTokenDoesNotMatch() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);

        assertThatThrownBy(() -> controller.storeGeneratedArtifact("wrong-token", generatedArtifactRequest()))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(fileInfoService);
    }

    @Test
    void returnsMetadataWhenInternalTokenMatches() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        FileMetadataDTO metadata = new FileMetadataDTO(
                7L,
                "aetherflow",
                "objects/audio.mp3",
                "audio.mp3",
                "audio/mpeg",
                1024L,
                "http://minio/aetherflow/objects/audio.mp3"
        );
        when(fileInfoService.getMetadata(1001L, 7L)).thenReturn(metadata);

        Result<FileMetadataDTO> result = controller.getMetadata(fileToken(), 1001L, 7L);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isSameAs(metadata);
        verify(fileInfoService).getMetadata(1001L, 7L);
    }

    @Test
    void rejectsInternalDownloadWhenTokenDoesNotMatch() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);

        assertThatThrownBy(() -> controller.download("wrong-token", 1001L, 9L))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN));
        verifyNoInteractions(fileInfoService);
    }

    @Test
    void downloadsFileWhenInternalTokenMatches() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileInternalProperties properties = new FileInternalProperties();
        properties.setInternalToken(secret());
        InternalFileController controller = new InternalFileController(fileInfoService, properties);
        byte[] bytes = "ocr image bytes".getBytes(StandardCharsets.UTF_8);
        when(fileInfoService.downloadInternal(1001L, 9L)).thenReturn(new FileDownload(
                "invoice.png",
                "image/png",
                (long) bytes.length,
                new ByteArrayInputStream(bytes)
        ));

        ResponseEntity<InputStreamResource> response = controller.download(fileToken(), 1001L, 9L);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getHeaders().getContentLength()).isEqualTo(bytes.length);
        assertThat(response.getHeaders().getContentDisposition().getFilename()).isEqualTo("invoice.png");
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("image/png");
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getInputStream().readAllBytes()).isEqualTo(bytes);
        verify(fileInfoService).downloadInternal(1001L, 9L);
    }

    private CreateFileMetadataRequestDTO validRequest() {
        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket("aetherflow");
        request.setObjectKey("outputs/demo.txt");
        request.setOriginalName("demo.txt");
        request.setContentType("text/plain");
        request.setSize(16L);
        return request;
    }

    private CreateGeneratedFileRequestDTO generatedArtifactRequest() {
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
        request.setContentBase64(java.util.Base64.getEncoder().encodeToString("subtitle".getBytes(StandardCharsets.UTF_8)));
        return request;
    }

    private static String fileToken() {
        return new InternalServiceTokenService(secret(), "aetherflow-internal", Duration.ofMinutes(1))
                .issue("file-service", Instant.now());
    }

    private static String secret() {
        return "0123456789abcdef0123456789abcdef";
    }
}
