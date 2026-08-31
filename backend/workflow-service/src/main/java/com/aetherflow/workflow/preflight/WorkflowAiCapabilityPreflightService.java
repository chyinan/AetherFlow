package com.aetherflow.workflow.preflight;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import org.springframework.beans.factory.annotation.Autowired;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class WorkflowAiCapabilityPreflightService {

    private final AiWorkflowNodeClient aiClient;
    @Autowired(required = false)
    private WorkflowNodeProperties nodeProperties;

    public void validate(WorkflowDefinitionDTO definition) {
        if (!WorkflowAiCapabilityPolicy.requiresRemoteCapabilities(definition)) {
            return;
        }
        AiWorkflowCapabilitiesDTO capabilities = loadCapabilities();
        List<String> violations = WorkflowAiCapabilityPolicy.validate(definition, capabilities);
        if (nodeProperties != null && !nodeProperties.isAsyncAiEnabled()) {
            violations = new java.util.ArrayList<>(violations);
            violations.addAll(WorkflowAiCapabilityPolicy.validateAsyncRequirement(definition));
        }
        if (!violations.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "workflow AI capability preflight failed: " + String.join("; ", violations));
        }
    }

    private AiWorkflowCapabilitiesDTO loadCapabilities() {
        try {
            Result<AiWorkflowCapabilitiesDTO> result = aiClient.capabilities();
            if (result == null || !result.isSuccess() || result.getData() == null) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "workflow AI capability service returned no usable snapshot");
            }
            return result.getData();
        } catch (BusinessException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "workflow AI capability service is unavailable");
        }
    }
}
