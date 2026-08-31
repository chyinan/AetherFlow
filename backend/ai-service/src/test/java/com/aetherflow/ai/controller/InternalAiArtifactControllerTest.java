package com.aetherflow.ai.controller;

import com.aetherflow.ai.config.AiInternalProperties;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiArtifactAuthorityRequestDTO;
import com.aetherflow.common.security.InternalServiceTokenService;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InternalAiArtifactControllerTest {

    @Test
    void validatesStageAuthorityAgainstFencedJobContext() {
        AiJobMapper mapper = mock(AiJobMapper.class);
        AiInternalProperties properties = new AiInternalProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        InternalAiArtifactController controller = new InternalAiArtifactController(mapper, properties);
        AiArtifactAuthorityRequestDTO request = new AiArtifactAuthorityRequestDTO();
        request.setUserId(1001L);
        request.setAiJobId(3003L);
        request.setTaskId(77L);
        request.setWorkflowInstanceId(2002L);
        request.setLeaseToken("lease-token-1");
        request.setOperation("STAGE");
        when(mapper.validateArtifactAuthority(1001L, 3003L, 77L, 2002L, "lease-token-1", "STAGE"))
                .thenReturn(true);
        String token = new InternalServiceTokenService(
                properties.getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1))
                .issue("ai-service", Instant.now());

        Result<Boolean> result = controller.validateAuthority(token, request);

        assertThat(result.getData()).isTrue();
        verify(mapper).validateArtifactAuthority(eq(1001L), eq(3003L), eq(77L), eq(2002L),
                eq("lease-token-1"), eq("STAGE"));
    }
}
