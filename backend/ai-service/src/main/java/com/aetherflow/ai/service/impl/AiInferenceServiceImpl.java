package com.aetherflow.ai.service.impl;

import com.aetherflow.ai.service.PythonAsrClient;
import com.aetherflow.ai.service.AiInferenceService;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AiInferenceServiceImpl implements AiInferenceService {

    private final PythonAsrClient pythonAsrClient;

    @Override
    public AiTranscriptionResponseDTO transcribe(AiTranscriptionRequestDTO request) {
        return pythonAsrClient.transcribe(request);
    }
}

