package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.GeneratedArtifactBatchRequestDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.entity.FileInfo;
import com.aetherflow.file.exception.UploadException;
import com.aetherflow.file.mapper.FileInfoMapper;
import com.aetherflow.file.model.FileUploadProfile;
import com.aetherflow.file.model.ProgressState;
import com.aetherflow.file.service.FileGovernanceCacheService;
import com.aetherflow.file.service.FileHashService;
import com.aetherflow.file.service.FileUploadGuardService;
import com.aetherflow.file.service.MinioHealthService;
import io.minio.BucketExistsArgs;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.ObjectWriteResponse;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.SetBucketPolicyArgs;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.ArgumentCaptor;

class FileInfoServiceImplReviewTest {

    private MinioClient minioClient;
    private MinioProperties minioProperties;
    private FileInfoMapper fileInfoMapper;
    private FileUploadGuardService fileUploadGuardService;
    private FileHashService fileHashService;
    private FileGovernanceCacheService cacheService;
    private MinioHealthService minioHealthService;
    private FileInfoServiceImpl service;

    @BeforeEach
    void setUp() {
        minioClient = mock(MinioClient.class);
        minioProperties = new MinioProperties();
        fileInfoMapper = mock(FileInfoMapper.class);
        fileUploadGuardService = mock(FileUploadGuardService.class);
        fileHashService = mock(FileHashService.class);
        cacheService = mock(FileGovernanceCacheService.class);
        minioHealthService = mock(MinioHealthService.class);
        service = new FileInfoServiceImpl(minioClient, minioProperties, fileInfoMapper,
                fileUploadGuardService, fileHashService, cacheService, minioHealthService);
    }

    @Test
    void uploadShouldRejectConcurrentSameHashWhenReservationFails() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "demo.txt", "text/plain", "hello".getBytes());
        when(fileUploadGuardService.validate(file)).thenReturn(new FileUploadProfile("demo.txt", "txt", "text/plain", 5));
        when(fileHashService.sha256(file)).thenReturn("hash-1");
        when(cacheService.findCachedHashFileId("hash-1")).thenReturn(java.util.Optional.empty());
        when(cacheService.tryReserveHashUpload("hash-1", "task-1")).thenReturn(false);
        when(fileInfoMapper.selectFirstAvailableByHash("hash-1")).thenReturn(null);

        assertThatThrownBy(() -> service.upload(1001L, file, "task-1"))
                .isInstanceOf(UploadException.class)
                .hasMessageContaining("already in progress");

        verify(minioClient, never()).putObject(any(PutObjectArgs.class));
        verify(fileInfoMapper, never()).insert(any(FileInfo.class));
        verify(cacheService, never()).releaseHashReservation(anyString(), anyString());
    }

    @Test
    void uploadShouldEvictStaleDeletedHashCacheAndUploadNewObject() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "demo.txt", "text/plain", "hello".getBytes());
        when(fileUploadGuardService.validate(file)).thenReturn(new FileUploadProfile("demo.txt", "txt", "text/plain", 5));
        when(fileHashService.sha256(file)).thenReturn("hash-stale");
        when(cacheService.findCachedHashFileId("hash-stale")).thenReturn(java.util.Optional.of(55L));
        FileInfo deletedFile = new FileInfo();
        deletedFile.setId(55L);
        deletedFile.setHash("hash-stale");
        deletedFile.setStatus("DELETED");
        when(fileInfoMapper.selectById(55L)).thenReturn(deletedFile);
        when(fileInfoMapper.selectFirstAvailableByHash("hash-stale")).thenReturn(null);
        when(cacheService.tryReserveHashUpload("hash-stale", "task-stale")).thenReturn(true);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn((ObjectWriteResponse) null);
        doAnswer(invocation -> {
            FileInfo fileInfo = invocation.getArgument(0);
            fileInfo.setId(102L);
            return 1;
        }).when(fileInfoMapper).insert(any(FileInfo.class));

        var metadata = service.upload(1001L, file, "task-stale");

        assertThat(metadata.getId()).isEqualTo(102L);
        verify(cacheService).evictHashCache("hash-stale");
        verify(cacheService).cacheHash("hash-stale", 102L);
    }

    @Test
    void downloadShouldRejectOwnerlessMetadata() throws Exception {
        FileInfo fileInfo = new FileInfo();
        fileInfo.setId(1L);
        fileInfo.setUserId(null);
        fileInfo.setBucket("aetherflow");
        fileInfo.setObjectKey("demo.txt");
        fileInfo.setOriginalName("demo.txt");
        fileInfo.setContentType("text/plain");
        fileInfo.setStatus("AVAILABLE");
        fileInfo.setCreatedAt(LocalDateTime.now());
        fileInfo.setUpdatedAt(LocalDateTime.now());
        when(fileInfoMapper.selectById(1L)).thenReturn(fileInfo);

        assertThatThrownBy(() -> service.download(1001L, 1L))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException businessException = (BusinessException) ex;
                    assertThat(businessException.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN);
                });

        verify(minioClient, never()).getObject(any(GetObjectArgs.class));
    }

    @Test
    void deleteShouldEvictHashCacheWhenLastReferenceIsDeleted() throws Exception {
        FileInfo fileInfo = new FileInfo();
        fileInfo.setId(77L);
        fileInfo.setUserId(1001L);
        fileInfo.setBucket("aetherflow");
        fileInfo.setObjectKey("objects/hash/demo.txt");
        fileInfo.setOriginalName("demo.txt");
        fileInfo.setContentType("text/plain");
        fileInfo.setHash("hash-delete");
        fileInfo.setStatus("AVAILABLE");
        fileInfo.setCreatedAt(LocalDateTime.now());
        fileInfo.setUpdatedAt(LocalDateTime.now());
        when(fileInfoMapper.selectById(77L)).thenReturn(fileInfo);
        when(fileInfoMapper.countAvailableByHash("hash-delete")).thenReturn(0L);

        service.delete(1001L, 77L);

        verify(cacheService).evictHashCache("hash-delete");
    }

    @Test
    void uploadShouldCommitMetadataAndCacheAfterSuccess() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "demo.txt", "text/plain", "hello".getBytes());
        when(fileUploadGuardService.validate(file)).thenReturn(new FileUploadProfile("demo.txt", "txt", "text/plain", 5));
        when(fileHashService.sha256(file)).thenReturn("hash-2");
        when(cacheService.findCachedHashFileId("hash-2")).thenReturn(java.util.Optional.empty());
        when(cacheService.tryReserveHashUpload("hash-2", "task-2")).thenReturn(true);
        when(fileInfoMapper.selectFirstAvailableByHash("hash-2")).thenReturn(null);
        when(minioClient.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn((ObjectWriteResponse) null);
        doAnswer(invocation -> {
            FileInfo fileInfo = invocation.getArgument(0);
            fileInfo.setId(101L);
            return 1;
        }).when(fileInfoMapper).insert(any(FileInfo.class));

        var metadata = service.upload(1001L, file, "task-2");

        assertThat(metadata.getId()).isEqualTo(101L);
        verify(cacheService).cacheHash("hash-2", 101L);
        verify(cacheService).recordUpload(eq(101L), eq(1001L), eq("task-2"), eq("hash-2"), eq(ProgressState.COMPLETED));
        verify(cacheService).recordProgress(eq("task-2"), eq(ProgressState.COMPLETED), eq(100), eq(101L), eq(1001L), eq("hash-2"), eq("Upload completed"));
    }

    @Test
    void metadataUsesShortLivedSignedUrlAndDoesNotExposePublicBucketPolicy() throws Exception {
        FileInfo fileInfo = new FileInfo();
        fileInfo.setId(9L);
        fileInfo.setUserId(1001L);
        fileInfo.setBucket("aetherflow");
        fileInfo.setObjectKey("objects/private.txt");
        fileInfo.setOriginalName("private.txt");
        fileInfo.setContentType("text/plain");
        fileInfo.setStatus("AVAILABLE");
        when(fileInfoMapper.selectById(9L)).thenReturn(fileInfo);
        when(minioClient.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://signed.example/private.txt?X-Amz-Signature=test");

        var metadata = service.getMetadata(9L);

        assertThat(metadata.getUrl()).startsWith("https://signed.example/");
        verify(minioClient, never()).setBucketPolicy(any(SetBucketPolicyArgs.class));
    }

    @Test
    void generatedArtifactIsStoredBeforeTenantOwnedMetadataBecomesAvailable() throws Exception {
        CreateGeneratedFileRequestDTO request = generatedArtifactRequest();
        when(fileInfoMapper.selectGeneratedByIdempotency(1001L, request.getIdempotencyKey())).thenReturn(null);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn((ObjectWriteResponse) null);
        doAnswer(invocation -> {
            FileInfo fileInfo = invocation.getArgument(0);
            fileInfo.setId(801L);
            return 1;
        }).when(fileInfoMapper).insertGeneratedArtifactReservation(any(FileInfo.class), anyLong());
        when(fileInfoMapper.completeGeneratedArtifactStage(eq(801L), anyString()))
                .thenReturn(1);
        when(minioClient.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://files.example/transcription.srt");

        var metadata = service.storeGeneratedArtifact(request);

        assertThat(metadata.getId()).isEqualTo(801L);
        assertThat(metadata.getUrl()).isNull();
        ArgumentCaptor<FileInfo> fileCaptor = ArgumentCaptor.forClass(FileInfo.class);
        verify(fileInfoMapper).insertGeneratedArtifactReservation(fileCaptor.capture(), anyLong());
        FileInfo stored = fileCaptor.getValue();
        assertThat(stored.getUserId()).isEqualTo(1001L);
        assertThat(stored.getIdempotencyKey()).isEqualTo(request.getIdempotencyKey());
        assertThat(stored.getSource()).isEqualTo("artifact");
        assertThat(stored.getArtifactKind()).isEqualTo("subtitle");
        assertThat(stored.getWorkflowId()).isEqualTo("2002");
        assertThat(stored.getObjectKey()).startsWith("workflow/exports/2002/users/1001/generated/");
        verify(minioClient).putObject(any(PutObjectArgs.class));
        verify(fileInfoMapper).completeGeneratedArtifactStage(eq(801L), anyString());
    }

    @Test
    void generatedArtifactRollbackDeletesItsOwnObjectEvenWhenSameHashExistsAtAnotherKey() throws Exception {
        CreateGeneratedFileRequestDTO request = generatedArtifactRequest();
        when(fileInfoMapper.selectGeneratedByIdempotency(1001L, request.getIdempotencyKey())).thenReturn(null);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn((ObjectWriteResponse) null);
        doAnswer(invocation -> {
            FileInfo fileInfo = invocation.getArgument(0);
            fileInfo.setId(802L);
            return 1;
        }).when(fileInfoMapper).insertGeneratedArtifactReservation(any(FileInfo.class), anyLong());
        when(fileInfoMapper.completeGeneratedArtifactStage(eq(802L), anyString()))
                .thenReturn(0);
        when(fileInfoMapper.failGeneratedArtifactClaim(eq(802L), anyString())).thenReturn(1);
        when(fileInfoMapper.countAvailableByHash(anyString())).thenReturn(1L);
        when(fileInfoMapper.countAvailableByObject(anyString(), anyString())).thenReturn(0L);

        assertThatThrownBy(() -> service.storeGeneratedArtifact(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ownership was lost");

        verify(minioClient).removeObject(any(RemoveObjectArgs.class));
    }

    @Test
    void staleUploadingArtifactIsFailedAndPhysicalObjectIsReconciled() throws Exception {
        FileInfo stale = new FileInfo();
        stale.setId(803L);
        stale.setStatus("UPLOADING");
        stale.setClaimToken("claim-stale");
        stale.setBucket("aetherflow");
        stale.setObjectKey("workflow/exports/2002/users/1001/generated/stale.srt");
        when(fileInfoMapper.selectStaleGeneratedArtifacts(anyLong(), eq(200))).thenReturn(java.util.List.of(stale));
        when(fileInfoMapper.failGeneratedArtifactClaim(803L, "claim-stale")).thenReturn(1);
        when(fileInfoMapper.countAvailableByObject(stale.getBucket(), stale.getObjectKey())).thenReturn(0L);

        assertThat(service.reconcileStaleGeneratedArtifacts()).isEqualTo(1);
        verify(fileInfoMapper).failGeneratedArtifactClaim(803L, "claim-stale");
        verify(minioClient).removeObject(any(RemoveObjectArgs.class));
    }

    @Test
    void expiredUploadingArtifactCanBeClaimedAndReplayedAfterProcessRestart() throws Exception {
        CreateGeneratedFileRequestDTO request = generatedArtifactRequest();
        FileInfo existing = new FileInfo();
        existing.setId(804L);
        existing.setUserId(1001L);
        existing.setAiJobId(3003L);
        existing.setTaskId(77L);
        existing.setArtifactBatchId(request.getArtifactBatchId());
        existing.setArtifactOrdinal(0);
        existing.setProducerFenceToken("old-lease");
        existing.setIdempotencyKey(request.getIdempotencyKey());
        existing.setStatus("UPLOADING");
        existing.setClaimExpiresAt(LocalDateTime.now().minusMinutes(1));
        existing.setBucket("aetherflow");
        existing.setHash("a02c387e87f68f102fb572f17f3ffacaf5837e119eff40d63449c29abb143759");
        existing.setObjectKey("workflow/exports/2002/users/1001/generated/old.srt");
        when(fileInfoMapper.selectGeneratedByIdempotency(1001L, request.getIdempotencyKey())).thenReturn(existing);
        when(fileInfoMapper.claimGeneratedArtifact(any(FileInfo.class), anyString(), anyLong())).thenReturn(1);
        when(fileInfoMapper.completeGeneratedArtifactStage(eq(804L), anyString())).thenReturn(1);
        when(minioClient.putObject(any(PutObjectArgs.class))).thenReturn((ObjectWriteResponse) null);
        when(minioClient.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://files.example/transcription.srt");

        var metadata = service.storeGeneratedArtifact(request);

        assertThat(metadata.getId()).isEqualTo(804L);
        verify(fileInfoMapper).claimGeneratedArtifact(any(FileInfo.class), anyString(), anyLong());
        verify(fileInfoMapper).completeGeneratedArtifactStage(eq(804L), anyString());
    }

    @Test
    void commitsOnlyCompleteStagedArtifactBatch() throws Exception {
        GeneratedArtifactBatchRequestDTO request = new GeneratedArtifactBatchRequestDTO();
        request.setUserId(1001L);
        request.setAiJobId(3003L);
        request.setTaskId(77L);
        request.setWorkflowId("2002");
        request.setArtifactBatchId("ai-task:77:node-whisper:artifacts");
        request.setExpectedCount(2);
        FileInfo first = stagedFile(805L, 0, "first.txt");
        FileInfo second = stagedFile(806L, 1, "second.txt");
        when(fileInfoMapper.selectGeneratedArtifactBatch(1001L, 3003L, request.getArtifactBatchId()))
                .thenReturn(java.util.List.of(first, second));
        when(fileInfoMapper.commitGeneratedArtifactBatch(1001L, 3003L, request.getArtifactBatchId()))
                .thenReturn(2);
        when(minioClient.getPresignedObjectUrl(any(GetPresignedObjectUrlArgs.class)))
                .thenReturn("https://files.example/staged.txt");

        var committed = service.commitGeneratedArtifactBatch(request);

        assertThat(committed).hasSize(2);
        verify(fileInfoMapper).commitGeneratedArtifactBatch(1001L, 3003L, request.getArtifactBatchId());
    }

    private FileInfo stagedFile(long id, int ordinal, String name) {
        FileInfo file = new FileInfo();
        file.setId(id);
        file.setUserId(1001L);
        file.setAiJobId(3003L);
        file.setTaskId(77L);
        file.setArtifactBatchId("ai-task:77:node-whisper:artifacts");
        file.setArtifactOrdinal(ordinal);
        file.setStatus("STAGED");
        file.setBucket("aetherflow");
        file.setObjectKey("workflow/exports/2002/users/1001/generated/" + name);
        file.setOriginalName(name);
        file.setContentType("text/plain");
        file.setFileSize(1L);
        file.setFileUrl("http://files.example/" + name);
        return file;
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
        request.setContentBase64(Base64.getEncoder().encodeToString("subtitle".getBytes(StandardCharsets.UTF_8)));
        return request;
    }
}
