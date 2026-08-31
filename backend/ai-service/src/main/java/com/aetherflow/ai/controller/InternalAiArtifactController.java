package com.aetherflow.ai.controller;

// pattern: Imperative Shell

import com.aetherflow.ai.config.AiInternalProperties;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiArtifactAuthorityRequestDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@RestController
@RequestMapping("/internal/ai/artifacts")
@RequiredArgsConstructor
public class InternalAiArtifactController {

    private final AiJobMapper aiJobMapper;
    private final InternalServiceTokenService tokenService;

    public InternalAiArtifactController(AiJobMapper aiJobMapper, AiInternalProperties properties) {
        this.aiJobMapper = aiJobMapper;
        this.tokenService = new InternalServiceTokenService(
                properties.getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1));
    }

    @PostMapping("/authority")
    public Result<Boolean> validateAuthority(
            @RequestHeader(value = InternalHeaders.AI_SERVICE_TOKEN, required = false) String token,
            @RequestBody AiArtifactAuthorityRequestDTO request) {
        if (!tokenService.isValid(token, "ai-service", Instant.now())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal ai token");
        }
        if (request == null || request.getUserId() == null || request.getAiJobId() == null
                || request.getTaskId() == null || request.getWorkflowInstanceId() == null
                || request.getOperation() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "artifact authority context is incomplete");
        }
        boolean valid = aiJobMapper.validateArtifactAuthority(
                request.getUserId(), request.getAiJobId(), request.getTaskId(),
                request.getWorkflowInstanceId(), request.getLeaseToken(), request.getOperation());
        return Result.success(valid);
    }
}
