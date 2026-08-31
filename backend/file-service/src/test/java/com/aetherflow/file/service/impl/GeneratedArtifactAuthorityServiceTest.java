package com.aetherflow.file.service.impl;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiArtifactAuthorityRequestDTO;
import com.aetherflow.common.dto.CreateGeneratedFileRequestDTO;
import com.aetherflow.file.client.AiArtifactAuthorityClient;
import com.aetherflow.file.config.AiClientProperties;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GeneratedArtifactAuthorityServiceTest {

    @Test
    void rejectsWhenAiAuthorityCannotProveCurrentLease() {
        AiArtifactAuthorityClient client = mock(AiArtifactAuthorityClient.class);
        when(client.validate(anyString(), any(AiArtifactAuthorityRequestDTO.class)))
                .thenReturn(Result.success(false));
        GeneratedArtifactAuthorityService service = new GeneratedArtifactAuthorityService(client, new AiClientProperties());
        CreateGeneratedFileRequestDTO request = new CreateGeneratedFileRequestDTO();
        request.setUserId(1001L);
        request.setAiJobId(3003L);
        request.setTaskId(77L);
        request.setWorkflowId("2002");
        request.setLeaseToken("lease-token-1");

        assertThatThrownBy(() -> service.assertCurrent(request))
                .isInstanceOf(com.aetherflow.common.exception.BusinessException.class)
                .hasMessageContaining("authority is no longer valid");
    }
}
