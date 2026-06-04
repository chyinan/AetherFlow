package com.aetherflow.file.service.impl;

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.model.ChunkUploadDtos;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
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

    private MockMultipartFile part(String name, String value) {
        return new MockMultipartFile("file", name, "application/octet-stream", value.getBytes(StandardCharsets.UTF_8));
    }
}
