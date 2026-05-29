package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.ocr.metrics.OCRMetrics;
import com.aetherflow.workflow.ocr.provider.OCRProvider;
import com.aetherflow.workflow.ocr.provider.OCRProviderRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OCRNodeExecutorTest {

    @Test
    void downloadsFileRecognizesTextAndWritesOcrVariables() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        OCRProvider provider = provider("tesseract");
        OCRProperties ocrProperties = ocrProperties();
        OCRMetrics ocrMetrics = new OCRMetrics();
        OCRNodeExecutor executor = executor(fileClient, List.of(provider), ocrProperties, ocrMetrics);
        byte[] bytes = "image-bytes".getBytes(StandardCharsets.UTF_8);
        when(fileClient.downloadFile("token", 9L)).thenReturn(fileResponse(bytes, "invoice.png", "image/png"));
        when(provider.recognize(argThat(request ->
                request.file().content().length == bytes.length
                        && "invoice.png".equals(request.file().fileName())
                        && "image/png".equals(request.file().contentType())
                        && "chi_sim".equals(request.config().language())
                        && request.config().enableTable()
        ))).thenReturn(new OCRResult("invoice total 100", "chi_sim", 0.91, 1));

        NodeResult result = executor.execute(context(Map.of(
                "fileId", 9L,
                "language", "chi_sim",
                "enableTable", true,
                "enableLayout", false
        ), Map.of()));

        assertThat(result.output()).containsEntry("text", "invoice total 100");
        assertThat(result.output()).containsEntry("language", "chi_sim");
        assertThat(result.output()).containsEntry("confidence", 0.91);
        assertThat(result.output()).containsEntry("pageCount", 1);
        assertThat(result.variables()).containsEntry("ocrText", "invoice total 100");
        assertThat(result.variables()).containsEntry("ocrLanguage", "chi_sim");
        assertThat(result.variables()).containsEntry("ocrConfidence", 0.91);
        assertThat(result.variables()).containsEntry("ocrPageCount", 1);
        assertThat(ocrMetrics.snapshot().ocrCount()).isEqualTo(1);
        assertThat(ocrMetrics.snapshot().failCount()).isZero();
        verify(fileClient).downloadFile("token", 9L);
    }

    @Test
    void readsFileIdFromConfiguredVariableName() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        OCRProvider provider = provider("tesseract");
        OCRProperties ocrProperties = ocrProperties();
        OCRNodeExecutor executor = executor(fileClient, List.of(provider), ocrProperties, new OCRMetrics());
        byte[] bytes = "image-bytes".getBytes(StandardCharsets.UTF_8);
        when(fileClient.downloadFile("token", 42L)).thenReturn(fileResponse(bytes, "invoice.jpg", "image/jpeg"));
        when(provider.recognize(argThat(request -> request.file().content().length == bytes.length)))
                .thenReturn(new OCRResult("invoice", "eng", 0.8, 1));

        NodeResult result = executor.execute(context(Map.of("fileIdVariable", "sourceFileId"),
                Map.of("sourceFileId", 42L)));

        assertThat(result.variables()).containsEntry("ocrText", "invoice");
        verify(fileClient).downloadFile("token", 42L);
    }

    @Test
    void supportsMockModeWithoutCallingFileService() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        OCRProvider tesseract = provider("tesseract");
        OCRProvider mockProvider = provider("mock");
        OCRProperties ocrProperties = ocrProperties();
        OCRNodeExecutor executor = executor(fileClient, List.of(tesseract, mockProvider), ocrProperties, new OCRMetrics());
        when(mockProvider.recognize(argThat(request ->
                request.file().content().length == 0
                        && request.config().mock()
        ))).thenReturn(new OCRResult("mock ocr text", "mock", 1.0, 1));

        NodeResult result = executor.execute(context(Map.of("mock", true), Map.of()));

        assertThat(result.variables()).containsEntry("ocrText", "mock ocr text");
        verify(fileClient, never()).downloadFile("token", 0L);
    }

    @Test
    void throwsOnProviderTimeoutSoRuntimeRetryCanHandleIt() throws Exception {
        FileMetadataClient fileClient = mock(FileMetadataClient.class);
        OCRProvider provider = provider("tesseract");
        OCRProperties ocrProperties = ocrProperties();
        ocrProperties.setTimeout(java.time.Duration.ofMillis(10));
        OCRMetrics ocrMetrics = new OCRMetrics();
        ExecutorService executorService = Executors.newSingleThreadExecutor();
        OCRNodeExecutor executor = executor(fileClient, List.of(provider), ocrProperties, ocrMetrics, executorService);
        byte[] bytes = "image-bytes".getBytes(StandardCharsets.UTF_8);
        when(fileClient.downloadFile("token", 9L)).thenReturn(fileResponse(bytes, "invoice.png", "image/png"));
        when(provider.recognize(argThat(request -> "invoice.png".equals(request.file().fileName()))))
                .thenAnswer(invocation -> {
                    Thread.sleep(200);
                    return new OCRResult("late result", "eng", 0.7, 1);
                });

        try {
            assertThatThrownBy(() -> executor.execute(context(Map.of("fileId", 9L), Map.of())))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("ocr execution timed out");
            assertThat(ocrMetrics.snapshot().ocrCount()).isEqualTo(1);
            assertThat(ocrMetrics.snapshot().failCount()).isEqualTo(1);
        } finally {
            executorService.shutdownNow();
        }
    }

    private static OCRNodeExecutor executor(FileMetadataClient fileClient,
                                            List<OCRProvider> providers,
                                            OCRProperties ocrProperties,
                                            OCRMetrics ocrMetrics) {
        return executor(fileClient, providers, ocrProperties, ocrMetrics, Runnable::run);
    }

    private static OCRNodeExecutor executor(FileMetadataClient fileClient,
                                            List<OCRProvider> providers,
                                            OCRProperties ocrProperties,
                                            OCRMetrics ocrMetrics,
                                            Executor directExecutor) {
        WorkflowNodeProperties nodeProperties = new WorkflowNodeProperties();
        nodeProperties.setFileInternalToken("token");
        return new OCRNodeExecutor(
                new WorkflowNodeMetrics(),
                fileClient,
                nodeProperties,
                new OCRProviderRegistry(providers, ocrProperties),
                ocrMetrics,
                ocrProperties,
                directExecutor
        );
    }

    private static OCRProvider provider(String name) {
        OCRProvider provider = mock(OCRProvider.class);
        when(provider.providerName()).thenReturn(name);
        return provider;
    }

    private static OCRProperties ocrProperties() {
        OCRProperties properties = new OCRProperties();
        properties.setDefaultLanguage("eng");
        properties.setDefaultProvider("tesseract");
        return properties;
    }

    private static ResponseEntity<byte[]> fileResponse(byte[] bytes, String filename, String contentType) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(ContentDisposition.attachment().filename(filename).build());
        headers.setContentType(MediaType.parseMediaType(contentType));
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("ocr", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("ocr");
        return context;
    }
}
