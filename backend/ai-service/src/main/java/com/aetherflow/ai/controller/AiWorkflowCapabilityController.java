package com.aetherflow.ai.controller;

import com.aetherflow.ai.capability.AiWorkflowCapabilityService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// pattern: Imperative Shell
@Tag(name = "AI Workflow Capabilities", description = "Current executable workflow AI capabilities.")
@RestController
@RequestMapping("/ai/workflow")
@RequiredArgsConstructor
public class AiWorkflowCapabilityController {

    private final AiWorkflowCapabilityService capabilityService;

    @Operation(summary = "Get executable AI workflow capabilities")
    @GetMapping("/capabilities")
    public Result<AiWorkflowCapabilitiesDTO> capabilities() {
        return Result.success(capabilityService.current());
    }
}
