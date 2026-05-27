package com.aetherflow.ai.service;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Slf4j
@Service
public class PythonAsrClient {

    private final RestClient pythonAiRestClient;

    public PythonAsrClient(@Qualifier("pythonAiRestClient") RestClient pythonAiRestClient) {
        this.pythonAiRestClient = pythonAiRestClient;
    }

    public AiTranscriptionResponseDTO transcribe(AiTranscriptionRequestDTO request) {
        log.info("Calling python ASR runtime fileUrl={}, language={}", request.getFileUrl(), request.getLanguage());
        AiTranscriptionResponseDTO response = pythonAiRestClient.post()
                .uri("/v1/transcriptions")
                .body(request)
                .retrieve()
                .body(AiTranscriptionResponseDTO.class);
        if (response == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python ai service returned empty response");
        }
        return response;
    }
}
