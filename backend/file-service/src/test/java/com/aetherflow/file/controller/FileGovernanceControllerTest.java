package com.aetherflow.file.controller;

import com.aetherflow.file.exception.FileExceptionHandler;
import com.aetherflow.file.exception.StorageException;
import com.aetherflow.file.filter.FileResultAdvice;
import com.aetherflow.file.filter.FileTraceFilter;
import com.aetherflow.file.model.FileMetricsResponse;
import com.aetherflow.file.model.FileStatusResponse;
import com.aetherflow.file.service.FileInfoService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class FileGovernanceControllerTest {

    private FileInfoService fileInfoService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        fileInfoService = mock(FileInfoService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new FileGovernanceController(fileInfoService))
                .setControllerAdvice(new FileExceptionHandler(), new FileResultAdvice())
                .addFilters(new FileTraceFilter())
                .build();
    }

    @Test
    void statusShouldReturnFileGovernanceSnapshot() throws Exception {
        when(fileInfoService.getStatus()).thenReturn(new FileStatusResponse("UP", 128L, 3L, 4096L));

        mockMvc.perform(get("/file/status")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.minioStatus").value("UP"))
                .andExpect(jsonPath("$.data.fileCount").value(128))
                .andExpect(jsonPath("$.data.uploadingTaskCount").value(3))
                .andExpect(jsonPath("$.data.storageSizeBytes").value(4096))
                .andExpect(jsonPath("$.traceId").value("trace-status"))
                .andExpect(jsonPath("$.path").value("/file/status"));
    }

    @Test
    void metricsShouldReturnFileMetricsSnapshot() throws Exception {
        when(fileInfoService.getMetrics()).thenReturn(new FileMetricsResponse("UP", 128L, 3L, 4096L, 312L));

        mockMvc.perform(get("/file/metrics")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.minioStatus").value("UP"))
                .andExpect(jsonPath("$.data.averageUploadDurationMs").value(312))
                .andExpect(jsonPath("$.traceId").value("trace-metrics"))
                .andExpect(jsonPath("$.path").value("/file/metrics"));
    }

    @Test
    void metricsShouldMapStorageFailureToServiceUnavailable() throws Exception {
        when(fileInfoService.getMetrics()).thenThrow(new StorageException("minio health check failed"));

        mockMvc.perform(get("/file/metrics")
                        .header(FileTraceFilter.TRACE_ID_HEADER, "trace-storage"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value(503))
                .andExpect(jsonPath("$.message").value("minio health check failed"))
                .andExpect(jsonPath("$.traceId").value("trace-storage"))
                .andExpect(jsonPath("$.path").value("/file/metrics"));
    }
}
