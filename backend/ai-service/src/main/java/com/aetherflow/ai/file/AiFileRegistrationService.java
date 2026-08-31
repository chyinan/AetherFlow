package com.aetherflow.ai.file;

// pattern: Imperative Shell

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.config.FileClientProperties;
import com.aetherflow.ai.task.AiJobLease;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiFileRegistrationService {

    private final FileClient fileClient;
    private final FileClientProperties fileClientProperties;

    public ArtifactRegistrationResult registerArtifacts(TaskMessageDTO taskMessage,
                                                        AiJobLease lease,
                                                        List<AiArtifact> artifacts) {
        if (artifacts == null || artifacts.isEmpty()) {
            return ArtifactRegistrationResult.empty();
        }
        if (taskMessage == null || taskMessage.getTaskId() == null
                || taskMessage.getUserId() == null || taskMessage.getUserId() <= 0
                || taskMessage.getWorkflowInstanceId() == null
                || taskMessage.getNodeId() == null || taskMessage.getNodeId().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated artifact task context is incomplete");
        }
        if (lease == null || lease.jobId() == null || lease.token() == null || lease.token().isBlank()) {
            throw new BusinessException(ResultCode.CONFLICT, "generated artifact lease context is incomplete");
        }

        for (int index = 0; index < artifacts.size(); index++) {
            AiArtifact artifact = artifacts.get(index);
            if (artifact == null || artifact.content().length == 0) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                        "generated artifact content is empty at ordinal " + index);
            }
            normalizeArtifactType(artifact.type());
        }

        String batchId = "ai-task:%s:%s:artifacts".formatted(
                taskMessage.getTaskId(), taskMessage.getNodeId().trim());
        List<FileMetadataDTO> storedFiles = new ArrayList<>();
        try {
            for (int index = 0; index < artifacts.size(); index++) {
            AiArtifact artifact = artifacts.get(index);
            if (artifact == null || artifact.content().length == 0) {
                throw new BusinessException(ResultCode.BAD_REQUEST,
                        "generated artifact content is empty at ordinal " + index);
            }
            String artifactType = normalizeArtifactType(artifact.type());
            CreateGeneratedFileRequestDTO request = new CreateGeneratedFileRequestDTO();
            request.setUserId(taskMessage.getUserId());
            request.setAiJobId(lease.jobId());
            request.setTaskId(taskMessage.getTaskId());
            request.setLeaseToken(lease.token());
            request.setArtifactBatchId(batchId);
            request.setArtifactOrdinal(index);
            request.setWorkflowId(String.valueOf(taskMessage.getWorkflowInstanceId()));
            request.setSource("artifact");
            request.setArtifactKind(artifactKind(artifactType));
            request.setOriginalName(artifact.fileName());
            request.setContentType(artifact.contentType());
            request.setIdempotencyKey("ai-task:%s:%s:%s:%s".formatted(
                    taskMessage.getTaskId(), taskMessage.getNodeId().trim(), artifactType, index));
            request.setContentBase64(Base64.getEncoder().encodeToString(artifact.content()));

            Result<FileMetadataDTO> result = fileClient.storeGeneratedArtifact(
                    fileClientProperties.issueInternalToken(), request);
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "generated artifact storage failed: " + artifact.fileName());
            }
                storedFiles.add(result.getData());
            }
        } catch (RuntimeException exception) {
            throw new ArtifactRegistrationException(batchId, artifacts.size(), exception);
        }
        return new ArtifactRegistrationResult(batchId, artifacts.size(), storedFiles);
    }

    private String normalizeArtifactType(String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "generated artifact type is required");
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String artifactKind(String artifactType) {
        return switch (artifactType) {
            case "SRT", "VTT" -> "subtitle";
            default -> "document";
        };
    }
}
