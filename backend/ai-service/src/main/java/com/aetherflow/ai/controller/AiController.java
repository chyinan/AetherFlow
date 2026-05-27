package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.service.AiInferenceService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
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

@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiInferenceService aiInferenceService;
    private final SentinelAiGuard sentinelAiGuard;
    private final AiTaskProperties properties;

    @PostMapping("/transcriptions")
    public Result<AiTranscriptionResponseDTO> transcribe(@Valid @RequestBody AiTranscriptionRequestDTO request) {
        return Result.success(sentinelAiGuard.execute("ai-http-transcription", () -> aiInferenceService.transcribe(request)));
    }

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

