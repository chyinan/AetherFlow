package com.aetherflow.ai.controller;

import com.aetherflow.ai.capability.AiWorkflowCapabilityService;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiWorkflowCapabilityControllerTest {

    @Test
    void exposesSafeCapabilitySnapshotToAuthenticatedFrontend() {
        AiWorkflowCapabilityService service = mock(AiWorkflowCapabilityService.class);
        AiWorkflowCapabilitiesDTO snapshot = new AiWorkflowCapabilitiesDTO(
                true, true, false, List.of("OLLAMA"), List.of(),
                List.of("LLM", "WHISPER"), List.of("LLM"),
                Map.of("WHISPER", "whisper runtime is disabled")
        );
        when(service.current()).thenReturn(snapshot);
        AiWorkflowCapabilityController controller = new AiWorkflowCapabilityController(service);

        Result<AiWorkflowCapabilitiesDTO> result = controller.capabilities();

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData()).isEqualTo(snapshot);
    }
}
