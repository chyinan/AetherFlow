package com.aetherflow.ai.file;

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.config.FileClientProperties;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiFileRegistrationServiceTest {

    @Test
    void sendsConfiguredInternalTokenWhenRegisteringArtifacts() {
        FileClient fileClient = mock(FileClient.class);
        FileClientProperties properties = new FileClientProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        AiFileRegistrationService service = new AiFileRegistrationService(fileClient, properties);
        when(fileClient.createMetadata(any(String.class), any(CreateFileMetadataRequestDTO.class)))
                .thenReturn(Result.success(new FileMetadataDTO()));

        service.registerArtifacts(List.of(new AiArtifact("summary", "outputs/summary.txt", "text/plain")));

        ArgumentCaptor<CreateFileMetadataRequestDTO> requestCaptor =
                ArgumentCaptor.forClass(CreateFileMetadataRequestDTO.class);
        verify(fileClient).createMetadata(any(String.class), requestCaptor.capture());
        assertThat(requestCaptor.getValue().getBucket()).isEqualTo("aetherflow");
        assertThat(requestCaptor.getValue().getObjectKey()).isEqualTo("outputs/summary.txt");
        assertThat(requestCaptor.getValue().getContentType()).isEqualTo("text/plain");
    }
}
