package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.service.CopilotCanvasEditFailureException;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CopilotCanvasEditFailureHandlerTest {

    private static final String REQUEST = "{\"prompt\":\"add a node\",\"context\":{\"nodes\":[]}}";

    @Test
    void canvasEditFailureReturnsExactPreparedConversationWithoutChangingError() throws Exception {
        CopilotService service = mock(CopilotService.class);
        when(service.editCanvas(eq(7L), any())).thenThrow(CopilotCanvasEditFailureException.from(
                new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "model unavailable"), "conv-11"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CopilotController(service))
                .setControllerAdvice(new CopilotCanvasEditFailureHandler(), new GlobalExceptionHandler())
                .build();

        mvc.perform(post("/copilot/canvas-edit").contentType(MediaType.APPLICATION_JSON)
                        .content(REQUEST).header("X-User-Id", "7"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value(ResultCode.SERVICE_UNAVAILABLE.getCode()))
                .andExpect(jsonPath("$.message").value("model unavailable"))
                .andExpect(jsonPath("$.data.type").value("canvas-edit-failure"))
                .andExpect(jsonPath("$.data.conversationId").value("conv-11"));
    }

    @Test
    void prePrepareFailureKeepsOrdinaryErrorEnvelopeWithoutConversationMetadata() throws Exception {
        CopilotService service = mock(CopilotService.class);
        when(service.editCanvas(eq(7L), any()))
                .thenThrow(new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "conversation store unavailable"));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CopilotController(service))
                .setControllerAdvice(new CopilotCanvasEditFailureHandler(), new GlobalExceptionHandler())
                .build();

        mvc.perform(post("/copilot/canvas-edit").contentType(MediaType.APPLICATION_JSON)
                        .content(REQUEST).header("X-User-Id", "7"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value(ResultCode.SERVICE_UNAVAILABLE.getCode()))
                .andExpect(jsonPath("$.message").value("conversation store unavailable"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
