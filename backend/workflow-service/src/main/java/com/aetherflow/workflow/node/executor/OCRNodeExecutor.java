package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.ocr.OCRInputFile;
import com.aetherflow.workflow.ocr.OCRNodeConfig;
import com.aetherflow.workflow.ocr.OCRRequest;
import com.aetherflow.workflow.ocr.OCRResult;
import com.aetherflow.workflow.ocr.config.OCRProperties;
import com.aetherflow.workflow.ocr.metrics.OCRMetrics;
import com.aetherflow.workflow.ocr.provider.OCRProvider;
import com.aetherflow.workflow.ocr.provider.OCRProviderRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ContentDisposition;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
public class OCRNodeExecutor extends BaseNodeExecutor {

    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties nodeProperties;
    private final OCRProviderRegistry providerRegistry;
    private final OCRMetrics ocrMetrics;
    private final OCRProperties ocrProperties;
    private final Executor executor;

    public OCRNodeExecutor(WorkflowNodeMetrics metrics,
                           FileMetadataClient fileClient,
                           WorkflowNodeProperties nodeProperties,
                           OCRProviderRegistry providerRegistry,
                           OCRMetrics ocrMetrics,
                           OCRProperties ocrProperties,
                           @Qualifier("ocrTaskExecutor") Executor executor) {
        super(WorkflowNodeTypes.OCR, metrics);
        this.fileClient = fileClient;
        this.nodeProperties = nodeProperties;
        this.providerRegistry = providerRegistry;
        this.ocrMetrics = ocrMetrics;
        this.ocrProperties = ocrProperties;
        this.executor = executor;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) throws Exception {
        long start = System.nanoTime();
        try {
            OCRNodeConfig ocrConfig = OCRNodeConfig.from(config, ocrProperties);
            OCRProvider provider = providerRegistry.select(ocrConfig);
            OCRInputFile file = ocrConfig.mock() ? mockFile() : downloadFile(context, config);
            OCRResult result = recognize(provider, file, ocrConfig);
            ocrMetrics.recordSuccess(elapsedMs(start));
            log.info("ocr node completed, provider={}, language={}, pageCount={}",
                    provider.providerName(), result.language(), result.pageCount());
            return buildResult(output(result), variables(result));
        } catch (Exception exception) {
            ocrMetrics.recordFailure(elapsedMs(start));
            throw exception;
        }
    }

    private OCRResult recognize(OCRProvider provider, OCRInputFile file, OCRNodeConfig config) throws Exception {
        OCRRequest request = new OCRRequest(file, config);
        CompletableFuture<OCRResult> future = CompletableFuture.supplyAsync(() -> {
            try {
                return provider.recognize(request);
            } catch (Exception exception) {
                throw new CompletionException(exception);
            }
        }, executor);
        try {
            return future.get(ocrProperties.getTimeout().toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException exception) {
            future.cancel(true);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ocr execution timed out");
        } catch (ExecutionException exception) {
            Throwable cause = exception.getCause();
            if (cause instanceof CompletionException completionException && completionException.getCause() != null) {
                cause = completionException.getCause();
            }
            if (cause instanceof Exception checked) {
                throw checked;
            }
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ocr execution failed");
        }
    }

    private OCRInputFile downloadFile(WorkflowContext context, Map<String, Object> config) {
        Long fileId = longValue(fileIdValue(context, config));
        if (fileId == null || fileId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ocr node fileId is required");
        }
        ResponseEntity<byte[]> response = fileClient.downloadFile(nodeProperties.getFileInternalToken(), fileId);
        if (response == null || !response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "file download for OCR failed");
        }
        return new OCRInputFile(
                fileName(response),
                contentType(response),
                response.getBody()
        );
    }

    private Object fileIdValue(WorkflowContext context, Map<String, Object> config) {
        if (config.containsKey("fileId")) {
            return config.get("fileId");
        }
        String variableName = stringValue(config.get("fileIdVariable"), "fileId");
        return context.variables().get(variableName);
    }

    private String fileName(ResponseEntity<byte[]> response) {
        ContentDisposition disposition = response.getHeaders().getContentDisposition();
        if (disposition != null && disposition.getFilename() != null) {
            return disposition.getFilename();
        }
        return "ocr-file";
    }

    private String contentType(ResponseEntity<byte[]> response) {
        MediaType mediaType = response.getHeaders().getContentType();
        return mediaType == null ? "application/octet-stream" : mediaType.toString();
    }

    private OCRInputFile mockFile() {
        return new OCRInputFile("mock.txt", "text/plain", new byte[0]);
    }

    private Map<String, Object> output(OCRResult result) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("text", result.text());
        output.put("language", result.language());
        output.put("confidence", result.confidence());
        output.put("pageCount", result.pageCount());
        return output;
    }

    private Map<String, Object> variables(OCRResult result) {
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("ocrText", result.text());
        variables.put("ocrLanguage", result.language());
        variables.put("ocrConfidence", result.confidence());
        variables.put("ocrPageCount", result.pageCount());
        return variables;
    }

    private Long longValue(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue;
        }
        return String.valueOf(value);
    }

    private long elapsedMs(long start) {
        return (System.nanoTime() - start) / 1_000_000L;
    }
}
