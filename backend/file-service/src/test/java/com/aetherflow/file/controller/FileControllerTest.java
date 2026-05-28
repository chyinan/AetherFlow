package com.aetherflow.file.controller;

import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.file.exception.FileTypeException;
import com.aetherflow.file.exception.FileExceptionHandler;
import com.aetherflow.file.filter.FileResultAdvice;
import com.aetherflow.file.filter.FileTraceFilter;
import com.aetherflow.file.model.UploadProgressView;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

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
    void getUploadProgressShouldReturnRedisProgressSnapshot() throws Exception {
        when(fileInfoService.getUploadProgress("task-2")).thenReturn(new UploadProgressView(
                "task-2",
                101L,
                "COMPLETED",
                100,
                "Upload completed",
                "sha256-value",
                1001L
        ));

        mockMvc.perform(get("/files/progress/task-2")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.taskId").value("task-2"))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.percentage").value(100))
                .andExpect(jsonPath("$.traceId").value("trace-2"))
                .andExpect(jsonPath("$.path").value("/files/progress/task-2"));
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
