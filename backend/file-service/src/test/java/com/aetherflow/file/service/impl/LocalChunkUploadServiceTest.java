package com.aetherflow.file.service.impl;

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.config.FileUploadProperties;
import com.aetherflow.file.config.MinioProperties;
import com.aetherflow.file.model.ChunkUploadDtos;
import com.aetherflow.file.service.FileInfoService;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import okhttp3.Headers;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.dao.DataAccessResourceFailureException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.lang.reflect.Constructor;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LocalChunkUploadServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void completesUploadByAssemblingPartsAndDelegatingToFileInfoUpload() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir);
        ChunkUploadDtos.InitResponse init = service.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt",
                "text/plain",
                10L,
                2,
                null
        ));
        service.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        service.uploadPart(1001L, init.uploadId(), 2, part("part-2", "world"));
        FileMetadataDTO metadata = new FileMetadataDTO(
                301L,
                "aetherflow",
                "objects/sha256/demo.txt",
                "demo.txt",
                "text/plain",
                10L,
                "http://minio/demo.txt"
        );
        AtomicReference<MultipartFile> completedFile = new AtomicReference<>();
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenAnswer(invocation -> {
                    MultipartFile file = invocation.getArgument(1);
                    completedFile.set(file);
                    assertThat(new String(file.getBytes(), StandardCharsets.UTF_8)).isEqualTo("helloworld");
                    assertThat(file.getOriginalFilename()).isEqualTo("demo.txt");
                    assertThat(file.getContentType()).isEqualTo("text/plain");
                    return metadata;
                });

        FileMetadataDTO result = service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null));

        assertThat(result.getId()).isEqualTo(301L);
        assertThat(completedFile.get()).isNotNull();
        assertThat(Files.exists(tempDir.resolve(init.uploadId()))).isFalse();
        verify(fileInfoService).upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
    }

    @Test
    void abortRemovesTemporaryParts() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir);
        ChunkUploadDtos.InitResponse init = service.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt",
                "text/plain",
                5L,
                1,
                null
        ));
        service.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));

        service.abort(1001L, init.uploadId());

        assertThat(Files.exists(tempDir.resolve(init.uploadId()))).isFalse();
    }

    @Test
    void abortShouldBeIdempotentWhenSessionIsMissing() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir);

        service.abort(1001L, "missing-upload");
    }

    @Test
    void rejectsDeclaredSizeAndPartCountOutsideConfiguredLimits() {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        FileUploadProperties properties = new FileUploadProperties();
        properties.setMaxSize(DataSize.ofBytes(10));
        properties.setMaxChunkParts(2);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir, properties);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.init(1001L,
                        new ChunkUploadDtos.InitRequest("large.txt", "text/plain", 11L, 1, null)))
                .isInstanceOf(com.aetherflow.file.exception.UploadException.class)
                .hasMessageContaining("maximum");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.init(1001L,
                        new ChunkUploadDtos.InitRequest("many.txt", "text/plain", 10L, 3, null)))
                .isInstanceOf(com.aetherflow.file.exception.UploadException.class)
                .hasMessageContaining("parts");
    }

    @Test
    void completeIsIdempotentAfterTheFirstSuccessfulCompletion() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir);
        ChunkUploadDtos.InitResponse init = service.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 5L, 1, null));
        service.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        FileMetadataDTO metadata = new FileMetadataDTO(303L, "aetherflow", "objects/demo.txt", "demo.txt",
                "text/plain", 5L, "http://minio/demo.txt");
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()))).thenReturn(metadata);

        assertThat(service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null))).isEqualTo(metadata);
        assertThat(service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null))).isEqualTo(metadata);
        verify(fileInfoService).upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
    }

    @Test
    void retainsUploadSessionWhenDelegatedUploadFailsSoRetryCanSucceed() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        LocalChunkUploadService service = new LocalChunkUploadService(fileInfoService, tempDir);
        ChunkUploadDtos.InitResponse init = service.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 5L, 1, null));
        service.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        FileMetadataDTO metadata = new FileMetadataDTO(305L, "aetherflow", "objects/demo.txt", "demo.txt",
                "text/plain", 5L, "http://minio/demo.txt");
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenThrow(new com.aetherflow.file.exception.UploadException(
                        com.aetherflow.common.core.ResultCode.SERVICE_UNAVAILABLE, "temporary upload failure"))
                .thenReturn(metadata);

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.complete(
                        1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isInstanceOf(com.aetherflow.file.exception.UploadException.class)
                .hasMessageContaining("temporary upload failure");

        assertThat(service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isEqualTo(metadata);
        verify(fileInfoService, org.mockito.Mockito.times(2))
                .upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
    }

    @Test
    void completesSharedUploadOnlyOnceWhenTwoInstancesCompleteConcurrently() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashOperations = mock(HashOperations.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        MinioClient minioClient = mock(MinioClient.class);
        MinioProperties minioProperties = new MinioProperties();
        FileUploadProperties uploadProperties = new FileUploadProperties();
        Map<String, Map<Object, Object>> storedHashes = new java.util.concurrent.ConcurrentHashMap<>();
        Map<String, String> completionLocks = new java.util.concurrent.ConcurrentHashMap<>();

        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(any(), any(), any(Duration.class))).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        when(valueOperations.setIfAbsent(any(), any())).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        doAnswer(invocation -> {
            java.util.List<?> keys = invocation.getArgument(1);
            String token = invocation.getArgument(2);
            return completionLocks.remove(keys.get(0), token) ? 1L : 0L;
        }).when(redisTemplate).execute(any(), any(), any());
        when(hashOperations.entries(any())).thenAnswer(invocation -> storedHashes.getOrDefault(
                invocation.getArgument(0), java.util.Collections.emptyMap()));
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            Map<?, ?> values = invocation.getArgument(1);
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .putAll(values);
            return null;
        }).when(hashOperations).putAll(any(), any());
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashOperations).put(any(), any(), any());
        when(redisTemplate.expire(any(), any(Duration.class))).thenReturn(true);
        when(redisTemplate.delete(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation ->
                storedHashes.remove(invocation.getArgument(0)) != null);
        when(minioClient.bucketExists(any())).thenReturn(true);
        when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(invocation -> {
            GetObjectArgs args = invocation.getArgument(0);
            String content = args.object().endsWith("00001.bin") ? "hello" : "world";
            return new GetObjectResponse(
                    Headers.of(),
                    args.bucket(),
                    null,
                    args.object(),
                    new java.io.ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        });

        LocalChunkUploadService firstInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-a"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        LocalChunkUploadService secondInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-b"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        ChunkUploadDtos.InitResponse init = firstInstance.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 10L, 2, null));
        firstInstance.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        firstInstance.uploadPart(1001L, init.uploadId(), 2, part("part-2", "world"));
        FileMetadataDTO metadata = new FileMetadataDTO(
                304L, null, "", null, "", 10L, null);
        CountDownLatch firstUploadStarted = new CountDownLatch(1);
        CountDownLatch secondUploadStarted = new CountDownLatch(1);
        AtomicInteger uploadCalls = new AtomicInteger();
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenAnswer(invocation -> {
                    int call = uploadCalls.incrementAndGet();
                    if (call == 1) {
                        completionLocks.remove("file:chunk-upload:lock:" + init.uploadId());
                        firstUploadStarted.countDown();
                        secondUploadStarted.await(2, TimeUnit.SECONDS);
                    } else {
                        secondUploadStarted.countDown();
                    }
                    return metadata;
                });

        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> firstInstance.complete(
                    1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)));
            assertThat(firstUploadStarted.await(5, TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> secondInstance.complete(
                    1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)));

            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(metadata);
            assertThat(second.get(10, TimeUnit.SECONDS)).isEqualTo(metadata);
            assertThat(Files.exists(tempDir.resolve("instance-b").resolve(init.uploadId()))).isFalse();
            assertThat(storedHashes.keySet())
                    .noneMatch(key -> key.startsWith("file:chunk-upload:")
                            && !key.startsWith("file:chunk-upload:result:"));
            verify(fileInfoService, org.mockito.Mockito.times(1))
                    .upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void keepsCompletionResultInSessionWhenDedicatedResultStoreFails() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashOperations = mock(HashOperations.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        MinioClient minioClient = mock(MinioClient.class);
        MinioProperties minioProperties = new MinioProperties();
        FileUploadProperties uploadProperties = new FileUploadProperties();
        Map<String, Map<Object, Object>> storedHashes = new java.util.concurrent.ConcurrentHashMap<>();
        Map<String, String> completionLocks = new java.util.concurrent.ConcurrentHashMap<>();

        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(any(), any(), any(Duration.class))).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        when(valueOperations.setIfAbsent(any(), any())).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        doAnswer(invocation -> {
            java.util.List<?> keys = invocation.getArgument(1);
            String token = invocation.getArgument(2);
            return completionLocks.remove(keys.get(0), token) ? 1L : 0L;
        }).when(redisTemplate).execute(any(), any(), any());
        when(hashOperations.entries(any())).thenAnswer(invocation -> storedHashes.getOrDefault(
                invocation.getArgument(0), java.util.Collections.emptyMap()));
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            if (key.contains(":result:")) {
                throw new DataAccessResourceFailureException("dedicated completion store unavailable");
            }
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .putAll(invocation.getArgument(1));
            return null;
        }).when(hashOperations).putAll(any(), any());
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashOperations).put(any(), any(), any());
        when(redisTemplate.expire(any(), any(Duration.class))).thenReturn(true);
        when(redisTemplate.delete(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation ->
                storedHashes.remove(invocation.getArgument(0)) != null);
        when(minioClient.bucketExists(any())).thenReturn(true);
        when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(invocation -> {
            GetObjectArgs args = invocation.getArgument(0);
            String content = args.object().endsWith("00001.bin") ? "hello" : "world";
            return new GetObjectResponse(
                    Headers.of(),
                    args.bucket(),
                    null,
                    args.object(),
                    new java.io.ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        });

        LocalChunkUploadService firstInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-a"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        LocalChunkUploadService secondInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-b"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        ChunkUploadDtos.InitResponse init = firstInstance.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 10L, 2, null));
        firstInstance.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        firstInstance.uploadPart(1001L, init.uploadId(), 2, part("part-2", "world"));
        FileMetadataDTO metadata = new FileMetadataDTO(
                306L, null, "", null, "", 10L, null);
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenReturn(metadata);

        assertThat(firstInstance.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isEqualTo(metadata);
        assertThat(secondInstance.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isEqualTo(metadata);
        verify(fileInfoService, org.mockito.Mockito.times(1))
                .upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
    }

    @Test
    void returnsLocalCompletionResultWhenBothRedisCompletionStoresFail() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashOperations = mock(HashOperations.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        MinioClient minioClient = mock(MinioClient.class);
        MinioProperties minioProperties = new MinioProperties();
        FileUploadProperties uploadProperties = new FileUploadProperties();
        Map<String, Map<Object, Object>> storedHashes = new java.util.concurrent.ConcurrentHashMap<>();
        Map<String, String> completionLocks = new java.util.concurrent.ConcurrentHashMap<>();
        java.util.concurrent.atomic.AtomicBoolean failCompletionPersistence =
                new java.util.concurrent.atomic.AtomicBoolean();

        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(any(), any(), any(Duration.class))).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        when(valueOperations.setIfAbsent(any(), any())).thenAnswer(invocation ->
                completionLocks.putIfAbsent(invocation.getArgument(0), invocation.getArgument(1)) == null);
        doAnswer(invocation -> {
            java.util.List<?> keys = invocation.getArgument(1);
            String token = invocation.getArgument(2);
            return completionLocks.remove(keys.get(0), token) ? 1L : 0L;
        }).when(redisTemplate).execute(any(), any(), any());
        when(hashOperations.entries(any())).thenAnswer(invocation -> storedHashes.getOrDefault(
                invocation.getArgument(0), java.util.Collections.emptyMap()));
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            if (failCompletionPersistence.get()) {
                throw new DataAccessResourceFailureException("completion stores unavailable");
            }
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .putAll(invocation.getArgument(1));
            return null;
        }).when(hashOperations).putAll(any(), any());
        doAnswer(invocation -> {
            String key = invocation.getArgument(0);
            storedHashes.computeIfAbsent(key, ignored -> new java.util.concurrent.ConcurrentHashMap<>())
                    .put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashOperations).put(any(), any(), any());
        when(redisTemplate.expire(any(), any(Duration.class))).thenReturn(true);
        when(redisTemplate.delete(org.mockito.ArgumentMatchers.anyString())).thenAnswer(invocation ->
                storedHashes.remove(invocation.getArgument(0)) != null);
        when(minioClient.bucketExists(any())).thenReturn(true);
        when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(invocation -> {
            GetObjectArgs args = invocation.getArgument(0);
            String content = args.object().endsWith("00001.bin") ? "hello" : "world";
            return new GetObjectResponse(
                    Headers.of(),
                    args.bucket(),
                    null,
                    args.object(),
                    new java.io.ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        });

        LocalChunkUploadService service = sharedService(
                fileInfoService, tempDir.resolve("instance-a"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        ChunkUploadDtos.InitResponse init = service.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 10L, 2, null));
        service.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        service.uploadPart(1001L, init.uploadId(), 2, part("part-2", "world"));
        failCompletionPersistence.set(true);
        FileMetadataDTO metadata = new FileMetadataDTO(
                307L, "aetherflow", "objects/sha256/demo.txt", "demo.txt", "text/plain", 10L,
                "http://minio/demo.txt");
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenReturn(metadata);

        assertThat(service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isEqualTo(metadata);
        assertThat(service.complete(1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null)))
                .isEqualTo(metadata);
        verify(fileInfoService, org.mockito.Mockito.times(1))
                .upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
    }

    @Test
    void completesSharedUploadFromAnotherInstanceWithDifferentLocalRoot() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashOperations = mock(HashOperations.class);
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        MinioClient minioClient = mock(MinioClient.class);
        MinioProperties minioProperties = new MinioProperties();
        FileUploadProperties uploadProperties = new FileUploadProperties();
        Map<Object, Object> storedSession = new HashMap<>();

        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(any(), any(), any(Duration.class))).thenReturn(true);
        when(valueOperations.setIfAbsent(any(), any())).thenReturn(true);
        when(hashOperations.entries(any())).thenReturn(storedSession);
        doAnswer(invocation -> {
            Map<?, ?> values = invocation.getArgument(1);
            storedSession.putAll(values);
            return null;
        }).when(hashOperations).putAll(any(), any());
        doAnswer(invocation -> {
            storedSession.put(invocation.getArgument(1), invocation.getArgument(2));
            return null;
        }).when(hashOperations).put(any(), any(), any());
        when(redisTemplate.expire(any(), any(Duration.class))).thenReturn(true);
        when(redisTemplate.delete(org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
        when(minioClient.bucketExists(any())).thenReturn(true);
        when(minioClient.getObject(any(GetObjectArgs.class))).thenAnswer(invocation -> {
            GetObjectArgs args = invocation.getArgument(0);
            String content = args.object().endsWith("00001.bin") ? "hello" : "world";
            return new GetObjectResponse(
                    Headers.of(),
                    args.bucket(),
                    null,
                    args.object(),
                    new java.io.ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8)));
        });

        LocalChunkUploadService firstInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-a"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        LocalChunkUploadService secondInstance = sharedService(
                fileInfoService, tempDir.resolve("instance-b"), redisTemplate, minioClient,
                minioProperties, uploadProperties);
        ChunkUploadDtos.InitResponse init = firstInstance.init(1001L, new ChunkUploadDtos.InitRequest(
                "demo.txt", "text/plain", 10L, 2, null));
        firstInstance.uploadPart(1001L, init.uploadId(), 1, part("part-1", "hello"));
        firstInstance.uploadPart(1001L, init.uploadId(), 2, part("part-2", "world"));
        FileMetadataDTO metadata = new FileMetadataDTO(
                302L, "aetherflow", "objects/sha256/demo.txt", "demo.txt", "text/plain", 10L,
                "http://minio/demo.txt");
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId())))
                .thenReturn(metadata);
        assertThat(Files.exists(tempDir.resolve("instance-b").resolve(init.uploadId()))).isFalse();

        FileMetadataDTO result = secondInstance.complete(
                1001L, init.uploadId(), new ChunkUploadDtos.CompleteRequest(null));

        assertThat(result.getId()).isEqualTo(302L);
        verify(fileInfoService).upload(eq(1001L), any(MultipartFile.class), eq(init.uploadId()));
        assertThat(Files.exists(tempDir.resolve("instance-b").resolve(init.uploadId()))).isFalse();
    }

    @SuppressWarnings("unchecked")
    private LocalChunkUploadService sharedService(FileInfoService fileInfoService,
                                                   Path rootDirectory,
                                                   StringRedisTemplate redisTemplate,
                                                   MinioClient minioClient,
                                                   MinioProperties minioProperties,
                                                   FileUploadProperties uploadProperties) throws Exception {
        Constructor<LocalChunkUploadService> constructor = LocalChunkUploadService.class
                .getDeclaredConstructor(FileInfoService.class, Path.class, StringRedisTemplate.class,
                        MinioClient.class, MinioProperties.class, FileUploadProperties.class);
        constructor.setAccessible(true);
        return constructor.newInstance(fileInfoService, rootDirectory, redisTemplate, minioClient,
                minioProperties, uploadProperties);
    }

    private MockMultipartFile part(String name, String value) {
        return new MockMultipartFile("file", name, "application/octet-stream", value.getBytes(StandardCharsets.UTF_8));
    }
}
