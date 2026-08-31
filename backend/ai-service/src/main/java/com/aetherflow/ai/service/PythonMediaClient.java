package com.aetherflow.ai.service;

// pattern: Imperative Shell

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiMediaTransformRequestDTO;
import com.aetherflow.common.dto.AiMediaTransformResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Base64;

@Service
@RequiredArgsConstructor
public class PythonMediaClient {

    @Qualifier("pythonAiRestClient")
    private final RestClient client;

    public AiMediaTransformResponseDTO transform(AiMediaTransformRequestDTO request) {
        AiMediaTransformResponseDTO response = client.post()
                .uri("/v1/media/ffmpeg")
                .body(request)
                .retrieve()
                .body(AiMediaTransformResponseDTO.class);
        if (response == null || response.getContentBase64() == null
                || response.getContentType() == null || response.getFileName() == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python media runtime returned an empty response");
        }
        try {
            byte[] content = Base64.getDecoder().decode(response.getContentBase64());
            if (content.length == 0 || content.length > 50 * 1024 * 1024) {
                throw new IllegalArgumentException("media output size is outside the allowed limit");
            }
            response.setSize((long) content.length);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python media runtime returned invalid bytes");
        }
        return response;
    }
}
