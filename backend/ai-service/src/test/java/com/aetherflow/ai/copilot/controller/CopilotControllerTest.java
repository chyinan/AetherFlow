package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CopilotControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void sendsChatPromptAndReturnsAssistantMessage() throws Exception {
        CopilotService service = mock(CopilotService.class);
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("Which node should I add next?");
        request.setWorkflowId("wf-1001");
        when(service.chat(request)).thenReturn(new CopilotChatResponse(
                "msg-22", "conv-11", "assistant",
                "A solid next node is Summary after Translate.",
                "19:36"
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();

        mockMvc.perform(post("/copilot/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value("msg-22"))
                .andExpect(jsonPath("$.data.conversationId").value("conv-11"))
                .andExpect(jsonPath("$.data.role").value("assistant"));

        verify(service).chat(request);
    }

    @Test
    void listsConversationsAndMessages() throws Exception {
        CopilotService service = mock(CopilotService.class);
        when(service.listConversations(20)).thenReturn(List.of(new CopilotConversationSummary(
                "conv-11", "Which node should I add next?", "wf-1001", "project-1",
                2, "2026-05-29T19:36:00"
        )));
        when(service.listMessages(11L)).thenReturn(List.of(
                new CopilotMessageResponse("msg-21", "user", "Which node should I add next?", "19:36"),
                new CopilotMessageResponse("msg-22", "assistant", "A solid next node is Summary.", "19:36")
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();

        mockMvc.perform(get("/copilot/conversations").param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value("conv-11"))
                .andExpect(jsonPath("$.data[0].messageCount").value(2));

        mockMvc.perform(get("/copilot/conversations/11/messages"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[1].role").value("assistant"));

        verify(service).listConversations(20);
        verify(service).listMessages(11L);
    }
}
