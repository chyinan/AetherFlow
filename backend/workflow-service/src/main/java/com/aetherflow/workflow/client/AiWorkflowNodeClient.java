package com.aetherflow.workflow.client;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "ai-service", path = "/ai/internal/workflow", configuration = AiWorkflowFeignConfig.class)
// pattern: Imperative Shell
public interface AiWorkflowNodeClient {

    @GetMapping("/nodes/capabilities")
    Result<AiWorkflowCapabilitiesDTO> capabilities();

    @PostMapping("/nodes/execute")
    Result<AiWorkflowNodeResponseDTO> execute(@RequestBody AiWorkflowNodeRequestDTO request);
}
