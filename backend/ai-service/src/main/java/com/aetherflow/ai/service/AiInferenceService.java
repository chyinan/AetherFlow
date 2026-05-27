package com.aetherflow.ai.service;

import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.dto.TaskMessageDTO;

public interface AiInferenceService {

    AiTranscriptionResponseDTO transcribe(AiTranscriptionRequestDTO request);

    void processTask(TaskMessageDTO taskMessage);
}

