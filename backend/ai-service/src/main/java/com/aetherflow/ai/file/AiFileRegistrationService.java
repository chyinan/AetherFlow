package com.aetherflow.ai.file;

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.config.FileClientProperties;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiFileRegistrationService {

    private final FileClient fileClient;
    private final FileClientProperties fileClientProperties;

    public void registerArtifacts(List<AiArtifact> artifacts) {
        for (AiArtifact artifact : artifacts) {
            if (artifact.objectKey() == null || artifact.objectKey().isBlank()) {
                continue;
            }
            CreateFileMetadataRequestDTO request = new CreateFileMetadataRequestDTO();
            request.setBucket("aetherflow");
            request.setObjectKey(artifact.objectKey());
            request.setOriginalName(artifact.objectKey());
            request.setContentType(artifact.contentType());
            Result<FileMetadataDTO> result = fileClient.createMetadata(fileClientProperties.getInternalToken(), request);
            if (result == null || !result.isSuccess()) {
                log.warn("Failed to register ai artifact objectKey={}", artifact.objectKey());
            }
        }
    }
}
