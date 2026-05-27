package com.aetherflow.ai.controller;

import com.aetherflow.ai.service.AiInferenceService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiInferenceService aiInferenceService;

    @PostMapping("/transcriptions")
    public Result<AiTranscriptionResponseDTO> transcribe(@Valid @RequestBody AiTranscriptionRequestDTO request) {
        return Result.success(aiInferenceService.transcribe(request));
    }
}

