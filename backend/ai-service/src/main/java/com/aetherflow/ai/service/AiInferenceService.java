package com.aetherflow.ai.service;

import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;

public interface AiInferenceService {

    AiTranscriptionResponseDTO transcribe(AiTranscriptionRequestDTO request);
}

