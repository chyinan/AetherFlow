package com.aetherflow.file.controller;

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.exception.FileExceptionHandler;
import com.aetherflow.file.exception.FileTypeException;
import com.aetherflow.file.filter.FileResultAdvice;
import com.aetherflow.file.filter.FileTraceFilter;
import com.aetherflow.file.model.FileAssetDtos.FileAssetMetadataView;
import com.aetherflow.file.model.FileAssetDtos.FileAssetPageResponse;
import com.aetherflow.file.model.UploadProgressView;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FileControllerTest {

    private FileInfoService fileInfoService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        fileInfoService = mock(FileInfoService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new FileController(fileInfoService))
                .setControllerAdvice(new FileExceptionHandler(), new FileResultAdvice())
                .addFilters(new FileTraceFilter())
                .build();
    }

    @Test
    void listFilesShouldForwardQueryAndUserContext() throws Exception {
        when(fileInfoService.listAssets(1001L, "demo", "audio", "input", "input", null, 2, 20))
                .thenReturn(new FileAssetPageResponse(
                        2,
                        20,
                        1,
                        List.of(new FileAssetMetadataView(
                                101L,
                                "101",
                                "demo.mp3",
                                "demo.mp3",
                                "audio",
                                "input",
                                "input",
                                2048L,
                                "audio/mpeg",
                                "ready",
                                null,
                                "File ready",
                                "http://minio/aetherflow/demo.mp3",
                                "objects/demo.mp3",
                                LocalDateTime.parse("2026-05-29T09:00:00"),
                                LocalDateTime.parse("2026-05-29T09:30:00")
                        ))
                ));

        mockMvc.perform(get("/files")
                        .header(FileTraceFilter.USER_ID_HEADER, "1001")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-list")
                        .param("query", "demo")
                        .param("type", "audio")
                        .param("source", "input")
                        .param("artifactKind", "input")
                        .param("page", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.page").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(101))
                .andExpect(jsonPath("$.data.items[0].type").value("audio"))
                .andExpect(jsonPath("$.data.items[0].source").value("input"))
                .andExpect(jsonPath("$.traceId").value("trace-list"))
                .andExpect(jsonPath("$.path").value("/files"));

        verify(fileInfoService).listAssets(1001L, "demo", "audio", "input", "input", null, 2, 20);
    }

    @Test
    void uploadShouldReturnTaskAndFileHeaders() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "demo.txt",
                "text/plain",
                "hello".getBytes(StandardCharsets.UTF_8)
        );
        FileMetadataDTO metadata = new FileMetadataDTO(
                101L,
                "aetherflow",
                "objects/sha256/ab/cd/hash.txt",
                "demo.txt",
                "text/plain",
                5L,
                "http://192.168.101.68:9000/aetherflow/objects/sha256/ab/cd/hash.txt"
        );
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq("task-1"))).thenReturn(metadata);

        mockMvc.perform(multipart("/files/upload")
                        .file(file)
                        .header(FileTraceFilter.USER_ID_HEADER, "1001")
                        .header("X-Upload-Task-Id", "task-1")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-1"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Upload-Task-Id", "task-1"))
                .andExpect(header().string("X-File-Id", "101"))
                .andExpect(header().string(FileTraceFilter.TRACE_ID_HEADER, "trace-1"))
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value(101))
                .andExpect(jsonPath("$.data.originalName").value("demo.txt"))
                .andExpect(jsonPath("$.traceId").value("trace-1"))
                .andExpect(jsonPath("$.path").value("/files/upload"));

        verify(fileInfoService).upload(eq(1001L), any(MultipartFile.class), eq("task-1"));
    }

    @Test
    void getUploadProgressShouldForwardUserContext() throws Exception {
        when(fileInfoService.getUploadProgress(1001L, "task-2")).thenReturn(new UploadProgressView(
                "task-2",
                101L,
                "COMPLETED",
                100,
                "Upload completed",
                "sha256-value",
                1001L
        ));

        mockMvc.perform(get("/files/progress/task-2")
                        .header(FileTraceFilter.USER_ID_HEADER, "1001")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.taskId").value("task-2"))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.percentage").value(100))
                .andExpect(jsonPath("$.traceId").value("trace-2"))
                .andExpect(jsonPath("$.path").value("/files/progress/task-2"));

        verify(fileInfoService).getUploadProgress(1001L, "task-2");
    }

    @Test
    void uploadShouldMapFileTypeExceptionToBadRequest() throws Exception {
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "malware.exe",
                "application/octet-stream",
                "MZ".getBytes(StandardCharsets.UTF_8)
        );
        when(fileInfoService.upload(eq(1001L), any(MultipartFile.class), eq("task-3")))
                .thenThrow(new FileTypeException("file extension is not allowed"));

        mockMvc.perform(multipart("/files/upload")
                        .file(file)
                        .header(FileTraceFilter.USER_ID_HEADER, "1001")
                        .header("X-Upload-Task-Id", "task-3")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-3"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("file extension is not allowed"))
                .andExpect(jsonPath("$.traceId").value("trace-3"))
                .andExpect(jsonPath("$.path").value("/files/upload"));
    }
}
