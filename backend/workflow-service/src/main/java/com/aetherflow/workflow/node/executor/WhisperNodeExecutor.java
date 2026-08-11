package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.client.FileMetadataClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

// pattern: Imperative Shell
@Component
public class WhisperNodeExecutor extends AbstractAiWorkflowNodeExecutor {

    private final FileMetadataClient fileClient;
    private final WorkflowNodeProperties properties;

    public WhisperNodeExecutor(WorkflowNodeMetrics metrics,
                               AiWorkflowNodeClient aiClient,
                               FileMetadataClient fileClient,
                               WorkflowNodeProperties properties) {
        super(WorkflowNodeTypes.WHISPER, metrics, aiClient);
        this.fileClient = fileClient;
        this.properties = properties;
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        String fileUrl = fileUrl(context, config);
        if (fileUrl.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "whisper node fileUrl is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("fileUrl", fileUrl);
        payload.put("language", stringValue(config.getOrDefault("language", properties.getDefaultWhisperLanguage())));
        payload.put("prompt", stringValue(config.getOrDefault("prompt", "")));
        AiWorkflowNodeResponseDTO response = executeAi(context, "WHISPER", payload);
        Map<String, Object> output = safeOutput(response);
        Map<String, Object> variables = new LinkedHashMap<>();
        Object text = output.get("text");
        if (text != null) {
            variables.put("transcription", text);
        }
        copyIfPresent(output, variables, "srtObjectKey");
        copyIfPresent(output, variables, "durationSeconds");
        return buildResult(output, variables);
    }

    private String fileUrl(WorkflowContext context, Map<String, Object> config) {
        String configured = stringValue(config.get("fileUrl"));
        if (!configured.isBlank()) {
            return configured;
        }
        String variableName = stringValue(config.getOrDefault("fileUrlVariable", "fileUrl"));
        String variableUrl = stringValue(context.variables().get(variableName));
        if (!variableUrl.isBlank()) {
            return variableUrl;
        }

        Object configuredFileId = config.containsKey("fileId")
                ? config.get("fileId")
                : context.variables().get(stringValue(config.getOrDefault("fileIdVariable", "fileId")));
        Long fileId = longValue(configuredFileId);
        if (fileId == null || fileId <= 0) {
            return "";
        }
        Long userId = longValue(context.variables().get("userId"));
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "whisper node userId is required");
        }
        Result<FileMetadataDTO> result = fileClient.getMetadata(properties.issueFileInternalToken(), userId, fileId);
        if (result == null || !result.isSuccess() || result.getData() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "file metadata lookup for whisper failed");
        }
        return stringValue(result.getData().getUrl());
    }

    private Map<String, Object> safeOutput(AiWorkflowNodeResponseDTO response) {
        return response.getOutput() == null ? Map.of() : response.getOutput();
    }

    private void copyIfPresent(Map<String, Object> source, Map<String, Object> target, String key) {
        if (source.containsKey(key) && source.get(key) != null) {
            target.put(key, source.get(key));
        }
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
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
}
