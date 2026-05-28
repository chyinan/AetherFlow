package com.aetherflow.workflow.client;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "ai-service", path = "/ai/internal/workflow")
public interface AiWorkflowNodeClient {

    @PostMapping("/nodes/execute")
    Result<AiWorkflowNodeResponseDTO> execute(@RequestBody AiWorkflowNodeRequestDTO request);
}
