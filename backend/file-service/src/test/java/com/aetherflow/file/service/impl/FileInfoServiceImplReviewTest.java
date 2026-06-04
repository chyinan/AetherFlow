package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.ResultCode;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
}
