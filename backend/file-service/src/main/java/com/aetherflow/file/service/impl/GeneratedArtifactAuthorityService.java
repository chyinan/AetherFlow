package com.aetherflow.file.service.impl;

// pattern: Imperative Shell

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiArtifactAuthorityRequestDTO;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.common.dto.GeneratedArtifactBatchRequestDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.file.client.AiArtifactAuthorityClient;
import com.aetherflow.file.config.AiClientProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GeneratedArtifactAuthorityService {

    private final AiArtifactAuthorityClient client;
    private final AiClientProperties properties;

    public void assertCurrent(CreateGeneratedFileRequestDTO request) {
        AiArtifactAuthorityRequestDTO authority = new AiArtifactAuthorityRequestDTO();
        authority.setUserId(request.getUserId());
        authority.setAiJobId(request.getAiJobId());
        authority.setTaskId(request.getTaskId());
        authority.setWorkflowInstanceId(parseWorkflowId(request.getWorkflowId()));
        authority.setLeaseToken(request.getLeaseToken());
        authority.setOperation("STAGE");
        assertValid(authority);
    }

    public void assertTerminal(GeneratedArtifactBatchRequestDTO request) {
        assertTerminal(request, "COMMIT");
    }

    public void assertFailed(GeneratedArtifactBatchRequestDTO request) {
        assertTerminal(request, "ABORT");
    }

    private void assertTerminal(GeneratedArtifactBatchRequestDTO request, String operation) {
        AiArtifactAuthorityRequestDTO authority = new AiArtifactAuthorityRequestDTO();
        authority.setUserId(request.getUserId());
        authority.setAiJobId(request.getAiJobId());
        authority.setTaskId(request.getTaskId());
        authority.setWorkflowInstanceId(parseWorkflowId(request.getWorkflowId()));
        authority.setOperation(operation);
        assertValid(authority);
    }

    private void assertValid(AiArtifactAuthorityRequestDTO authority) {
        try {
            var result = client.validate(properties.issueInternalToken(), authority);
            if (result == null || !result.isSuccess() || !Boolean.TRUE.equals(result.getData())) {
                throw new BusinessException(ResultCode.CONFLICT, "generated artifact authority is no longer valid");
            }
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "AI lease authority service is unavailable");
        }
    }

    private Long parseWorkflowId(String workflowId) {
        try {
            long id = Long.parseLong(workflowId);
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return id;
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflowId must be a positive numeric instance id");
        }
    }
}
