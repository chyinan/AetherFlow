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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.lang.reflect.Constructor;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

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
    void completesSharedUploadFromAnotherInstanceWithDifferentLocalRoot() throws Exception {
        FileInfoService fileInfoService = mock(FileInfoService.class);
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        HashOperations<String, Object, Object> hashOperations = mock(HashOperations.class);
        MinioClient minioClient = mock(MinioClient.class);
        MinioProperties minioProperties = new MinioProperties();
        FileUploadProperties uploadProperties = new FileUploadProperties();
        Map<Object, Object> storedSession = new HashMap<>();

        when(redisTemplate.opsForHash()).thenReturn(hashOperations);
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
