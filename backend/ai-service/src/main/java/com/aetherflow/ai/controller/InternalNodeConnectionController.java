package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiInternalProperties;
import com.aetherflow.ai.connection.NodeConnectionService;
import com.aetherflow.common.core.InternalHeaders;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.NodeConnectionValidationRequest;
import com.aetherflow.common.dto.NodeConnectionValidationResponse;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;

@RestController
@Tag(name = "Internal 节点连接校验", description = "工作流启动前内部连接与模型目录校验")
@RequestMapping("/ai/internal/workflow/nodes/connections")
public class InternalNodeConnectionController {
    private final NodeConnectionService service;
    private final InternalServiceTokenService internalTokenService;

    public InternalNodeConnectionController(NodeConnectionService service, AiInternalProperties properties) {
        this.service = service;
        this.internalTokenService = new InternalServiceTokenService(
                properties.getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1));
    }

    @PostMapping("/validate")
    @Operation(summary = "校验显式连接节点的 Provider、目录与所选选项")
    public Result<NodeConnectionValidationResponse> validate(
            @RequestHeader(value = InternalHeaders.AI_SERVICE_TOKEN, required = false) String internalToken,
            @Valid @RequestBody NodeConnectionValidationRequest request) {
        if (!internalTokenService.isValid(internalToken, "ai-service", Instant.now())) {
            throw new BusinessException(ResultCode.FORBIDDEN, "invalid internal ai token");
        }
        return Result.success(service.validate(request));
    }
}
