package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.config.WorkflowNodeConfig;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
public class ExportNodeExecutor extends BaseNodeExecutor {

    private final MinioClient minioClient;
    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties properties;
    private final WorkflowNodeConfig.MinioProperties minioProperties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ExportNodeExecutor(WorkflowNodeMetrics metrics,
                              MinioClient minioClient,
                              FileMetadataClient fileClient,
                              WorkflowNodeProperties properties,
                              WorkflowNodeConfig.MinioProperties minioProperties) {
        super(WorkflowNodeTypes.EXPORT, metrics);
        this.minioClient = minioClient;
        this.fileClient = fileClient;
        this.properties = properties;
        this.minioProperties = minioProperties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        ExportFormat format = ExportFormat.from(config.get("format"));
        Object contentValue = contentValue(context, config);
        if (contentValue == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "export node content is required");
        }
        String content = renderContent(format, contentValue);
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        String fileName = fileName(config, format);
        String objectKey = objectKey(context, config, fileName);
        upload(objectKey, format, bytes);
        FileMetadataDTO metadata = createMetadata(context, objectKey, fileName, format, bytes.length);
        Map<String, Object> output = output(format, metadata, bytes.length);
        Map<String, Object> variables = variables(format, metadata);
        return buildResult(output, variables);
    }

    private Object contentValue(WorkflowContext context, Map<String, Object> config) {
        if (config.containsKey("content")) {
            return config.get("content");
        }
        String sourceVariable = stringValue(config.getOrDefault("sourceVariable", "summary"), "summary");
        Object value = context.variables().get(sourceVariable);
        if (value == null) {
            value = context.variables().get("summary");
        }
        if (value == null) {
            value = context.variables().get("transcription");
        }
        if (value == null) {
            value = context.variables().get("text");
        }
        return value;
    }

    private String renderContent(ExportFormat format, Object contentValue) {
        if (format == ExportFormat.JSON) {
            try {
                return objectMapper.writeValueAsString(contentValue);
            } catch (JsonProcessingException exception) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "export node json content is invalid");
            }
        }
        return String.valueOf(contentValue);
    }

    private void upload(String objectKey, ExportFormat format, byte[] bytes) {
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioProperties.getBucket())
                    .object(objectKey)
                    .stream(inputStream, bytes.length, -1)
                    .contentType(format.contentType)
                    .build());
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow export upload failed");
        }
    }

    private FileMetadataDTO createMetadata(WorkflowContext context, String objectKey, String fileName, ExportFormat format, long size) {
        CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
        request.setBucket(minioProperties.getBucket());
        request.setObjectKey(objectKey);
        request.setOriginalName(fileName);
        request.setContentType(format.contentType);
        request.setSize(size);
        Long userId = longValue(context.variables().get("userId"));
        if (userId != null && userId > 0) {
            request.setUserId(userId);
        }
        Result<FileMetadataDTO> result = fileClient.createMetadata(properties.getFileInternalToken(), request);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "workflow export metadata registration failed");
        }
        return result.getData();
    }

    private Map<String, Object> output(ExportFormat format, FileMetadataDTO metadata, long size) {
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("format", format.name());
        output.put("size", size);
        putIfPresent(output, "fileId", metadata.getId());
        putIfPresent(output, "bucket", metadata.getBucket());
        putIfPresent(output, "objectKey", metadata.getObjectKey());
        putIfPresent(output, "originalName", metadata.getOriginalName());
        putIfPresent(output, "contentType", metadata.getContentType());
        putIfPresent(output, "url", metadata.getUrl());
        return output;
    }

    private Map<String, Object> variables(ExportFormat format, FileMetadataDTO metadata) {
        Map<String, Object> variables = new LinkedHashMap<>();
        variables.put("exportFormat", format.name());
        variables.put("exportFile", metadata);
        putIfPresent(variables, "exportFileId", metadata.getId());
        putIfPresent(variables, "exportFileUrl", metadata.getUrl());
        putIfPresent(variables, "exportObjectKey", metadata.getObjectKey());
        return variables;
    }

    private String fileName(Map<String, Object> config, ExportFormat format) {
        String configured = stringValue(config.get("fileName"), "");
        if (!configured.isBlank()) {
            return configured;
        }
        return "workflow-export." + format.extension;
    }

    private String objectKey(WorkflowContext context, Map<String, Object> config, String fileName) {
        String configured = stringValue(config.get("objectKey"), "");
        if (!configured.isBlank()) {
            return trimSlashes(configured);
        }
        String outputDirectory = trimSlashes(stringValue(config.get("outputDirectory"), ""));
        String prefix = outputDirectory.isBlank()
                ? trimSlashes(properties.getExportObjectPrefix()) + "/" + context.workflowId() + "/" + context.currentNodeId()
                : outputDirectory;
        String timestamp = DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS")
                .format(OffsetDateTime.now());
        return prefix + "/" + timestamp + "-" + UUID.randomUUID() + "-" + sanitize(fileName);
    }

    private Long longValue(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private String sanitize(String value) {
        String sanitized = value.replaceAll("[^a-zA-Z0-9._-]", "_");
        return sanitized.isBlank() ? "workflow-export" : sanitized;
    }

    private String trimSlashes(String value) {
        if (value == null) {
            return "";
        }
        return value.replaceAll("^/+", "").replaceAll("/+$", "");
    }

    private String stringValue(Object value, String defaultValue) {
        if (value == null || String.valueOf(value).isBlank()) {
            return defaultValue;
        }
        return String.valueOf(value);
    }

    private void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null) {
            target.put(key, value);
        }
    }

    private enum ExportFormat {
        MARKDOWN("md", "text/markdown"),
        TXT("txt", "text/plain"),
        JSON("json", "application/json");

        private final String extension;
        private final String contentType;

        ExportFormat(String extension, String contentType) {
            this.extension = extension;
            this.contentType = contentType;
        }

        private static ExportFormat from(Object value) {
            if (value == null || String.valueOf(value).isBlank()) {
                return MARKDOWN;
            }
            String normalized = String.valueOf(value).trim().toUpperCase(Locale.ROOT);
            if ("MD".equals(normalized)) {
                return MARKDOWN;
            }
            try {
                return ExportFormat.valueOf(normalized);
            } catch (IllegalArgumentException exception) {
                throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported export format");
            }
        }
    }
}
