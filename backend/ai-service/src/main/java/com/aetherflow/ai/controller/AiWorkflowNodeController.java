package com.aetherflow.ai.controller;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Tag(name = "Internal AI Workflow Node", description = "Internal service-to-service API used by workflow-service. Frontend clients should not call this endpoint directly.")
@RestController
@RequestMapping("/ai/internal/workflow/nodes")
@RequiredArgsConstructor
public class AiWorkflowNodeController {

    private final DefaultAiNodeExecutorRegistry executorRegistry;

    @Operation(summary = "Execute AI workflow node internally",
            description = "Internal service-to-service endpoint for workflow-service to execute ASR, LLM, translate and summary AI nodes. Frontend should use workflow-service APIs and node catalog instead.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "AI workflow node executed.",
                    content = @Content(schema = @Schema(implementation = AiWorkflowNodeResponseDTO.class))),
            @ApiResponse(responseCode = "400", description = "Invalid internal node execution request."),
            @ApiResponse(responseCode = "503", description = "AI provider unavailable."),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @PostMapping("/execute")
    public Result<AiWorkflowNodeResponseDTO> execute(@Valid @RequestBody AiWorkflowNodeRequestDTO request) {
        String executorType = executorType(request.getNodeType());
        Map<String, Object> payload = request.getPayload() == null
                ? Map.of()
                : new LinkedHashMap<>(request.getPayload());
        AiNodeExecutor executor = executorRegistry.getRequired(executorType);
        log.info("AI workflow node execution started traceId={} workflowId={} nodeId={} nodeType={} executorType={}",
                request.getTraceId(), request.getWorkflowId(), request.getNodeId(), request.getNodeType(), executorType);
        AiNodeResult result = executor.execute(new AiNodeExecutionContext(taskMessage(request, executorType), payload));
        log.info("AI workflow node execution completed traceId={} workflowId={} nodeId={} nodeType={} status={}",
                request.getTraceId(), request.getWorkflowId(), request.getNodeId(), request.getNodeType(), result.status());
        return Result.success(new AiWorkflowNodeResponseDTO(
                normalizeNodeType(request.getNodeType()),
                result.status(),
                result.output()
        ));
    }

    private TaskMessageDTO taskMessage(AiWorkflowNodeRequestDTO request, String executorType) {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setNodeId(request.getNodeId());
        message.setNodeType(executorType);
        message.setPayload(request.getPayload());
        return message;
    }

    private String executorType(String nodeType) {
        String normalized = normalizeNodeType(nodeType);
        if ("WHISPER".equals(normalized)) {
            return "ASR";
        }
        return normalized;
    }

    private String normalizeNodeType(String nodeType) {
        return nodeType == null ? "" : nodeType.trim().toUpperCase(Locale.ROOT);
    }
}
