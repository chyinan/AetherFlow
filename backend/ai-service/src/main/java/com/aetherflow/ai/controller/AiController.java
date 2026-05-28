package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.service.AiInferenceService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Tag(name = "AI", description = "Frontend public AI capability APIs.")
@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiInferenceService aiInferenceService;
    private final SentinelAiGuard sentinelAiGuard;
    private final AiTaskProperties properties;

    @Operation(summary = "Create transcription",
            description = "Transcribes a file URL through ai-service ASR capability. For workflow nodes, frontend should configure WHISPER in GET /workflow/node/catalog.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Transcription completed.",
                    content = @Content(schema = @Schema(implementation = AiTranscriptionResponseDTO.class))),
            @ApiResponse(responseCode = "400", description = "Invalid transcription request."),
            @ApiResponse(responseCode = "429", description = "AI service rate limited by Sentinel."),
            @ApiResponse(responseCode = "503", description = "AI provider unavailable.")
    })
    @PostMapping("/transcriptions")
    public Result<AiTranscriptionResponseDTO> transcribe(@Valid @RequestBody AiTranscriptionRequestDTO request) {
        return Result.success(sentinelAiGuard.execute("ai-http-transcription", () -> aiInferenceService.transcribe(request)));
    }

    @Operation(summary = "Get AI service status",
            description = "Returns AI service health, default provider/model and enabled capabilities for frontend diagnostics.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "AI service status returned.",
                    content = @Content(schema = @Schema(implementation = Map.class))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/status")
    public Result<Map<String, Object>> status() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("service", "ai-service");
        status.put("status", "UP");
        status.put("time", OffsetDateTime.now());
        status.put("defaultProvider", properties.getDefaultProvider().name());
        status.put("defaultModel", properties.getDefaultModel());
        status.put("capabilities", List.of("ASR", "SUMMARY", "TRANSLATE", "SUBTITLE"));
        status.put("providers", List.of("OPENAI", "OLLAMA"));
        status.put("mqConsumer", "aetherflow.ai.task.queue");
        return Result.success(status);
    }
}

