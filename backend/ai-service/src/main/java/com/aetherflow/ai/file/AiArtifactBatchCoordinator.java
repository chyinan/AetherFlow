package com.aetherflow.ai.file;

// pattern: Imperative Shell

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.config.FileClientProperties;
import com.aetherflow.ai.outbox.AiTaskEventPayload;
import com.aetherflow.ai.outbox.AiTaskEventOutbox;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.GeneratedArtifactBatchRequestDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiArtifactBatchCoordinator {

    private final FileClient fileClient;
    private final FileClientProperties fileClientProperties;

    public java.util.List<com.aetherflow.common.dto.FileMetadataDTO> commit(AiTaskEventOutbox event, AiTaskEventPayload payload) {
        if (payload == null || payload.result() == null
                || payload.result().artifactBatchId() == null
                || payload.result().artifactCount() == null
                || payload.result().artifactCount() <= 0) {
            return java.util.List.of();
        }
        var message = payload.taskMessage();
        if (message == null || message.getUserId() == null || event == null || event.getAiJobId() == null) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "artifact batch commit context is incomplete");
        }
        GeneratedArtifactBatchRequestDTO request = request(message, event.getAiJobId(),
                payload.result().artifactBatchId(), payload.result().artifactCount());
        Result<java.util.List<com.aetherflow.common.dto.FileMetadataDTO>> result =
                fileClient.commitGeneratedArtifactBatch(fileClientProperties.issueInternalToken(), request);
        if (result == null || !result.isSuccess() || result.getData() == null
                || result.getData().size() != request.getExpectedCount()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "generated artifact batch commit failed");
        }
        return result.getData();
    }

    public void abort(AiTaskEventOutbox event, AiTaskEventPayload payload) {
        if (payload == null || payload.taskMessage() == null || payload.result() == null
                || payload.result().artifactBatchId() == null
                || event == null || event.getAiJobId() == null) {
            return;
        }
        var message = payload.taskMessage();
        if (message.getUserId() == null) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "artifact batch abort context is incomplete");
        }
        String batchId = payload.result().artifactBatchId();
        GeneratedArtifactBatchRequestDTO request = request(message, event.getAiJobId(), batchId, 1);
        Result<Void> result = fileClient.abortGeneratedArtifactBatch(fileClientProperties.issueInternalToken(), request);
        if (result == null || !result.isSuccess()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "generated artifact batch abort failed");
        }
    }

    private GeneratedArtifactBatchRequestDTO request(com.aetherflow.common.dto.TaskMessageDTO message,
                                                     Long aiJobId,
                                                     String batchId,
                                                     int expectedCount) {
        GeneratedArtifactBatchRequestDTO request = new GeneratedArtifactBatchRequestDTO();
        request.setUserId(message.getUserId());
        request.setAiJobId(aiJobId);
        request.setTaskId(message.getTaskId());
        request.setWorkflowId(String.valueOf(message.getWorkflowInstanceId()));
        request.setArtifactBatchId(batchId);
        request.setExpectedCount(expectedCount);
        return request;
    }
}
