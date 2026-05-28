package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class UploadNodeExecutor extends BaseNodeExecutor {

    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties properties;

    public UploadNodeExecutor(WorkflowNodeMetrics metrics,
                              FileMetadataClient fileClient,
                              WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.UPLOAD, metrics);
        this.fileClient = fileClient;
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Long fileId = longValue(fileIdValue(context, config));
        if (fileId == null || fileId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "upload node fileId is required");
        }
        Result<FileMetadataDTO> result = fileClient.getMetadata(properties.getFileInternalToken(), fileId);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "file metadata lookup failed");
        }
        FileMetadataDTO metadata = result.getData();
        Map<String, Object> output = metadataOutput(metadata);
        Map<String, Object> variables = new LinkedHashMap<>(output);
        putIfPresent(variables, "fileBucket", metadata.getBucket());
        putIfPresent(variables, "fileObjectKey", metadata.getObjectKey());
        putIfPresent(variables, "fileOriginalName", metadata.getOriginalName());
        putIfPresent(variables, "fileContentType", metadata.getContentType());
        putIfPresent(variables, "fileSize", metadata.getSize());
        putIfPresent(variables, "fileUrl", metadata.getUrl());
        return buildResult(output, variables);
    }

    private Object fileIdValue(WorkflowContext context, Map<String, Object> config) {
        if (config.containsKey("fileId")) {
            return config.get("fileId");
        }
        String variableName = stringValue(config.get("fileIdVariable"), "fileId");
        return context.variables().get(variableName);
    }

    private Map<String, Object> metadataOutput(FileMetadataDTO metadata) {
        Map<String, Object> output = new LinkedHashMap<>();
        putIfPresent(output, "fileId", metadata.getId());
        putIfPresent(output, "bucket", metadata.getBucket());
        putIfPresent(output, "objectKey", metadata.getObjectKey());
        putIfPresent(output, "originalName", metadata.getOriginalName());
        putIfPresent(output, "contentType", metadata.getContentType());
        putIfPresent(output, "size", metadata.getSize());
        putIfPresent(output, "url", metadata.getUrl());
        return output;
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

    private void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null) {
            target.put(key, value);
        }
    }
}
