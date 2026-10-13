package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationMetadata;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CopilotControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void streamsConversationBeforeDeltaAndCompletion() throws Exception {
        CopilotService service = mock(CopilotService.class);
        doAnswer(invocation -> {
            Consumer<CopilotConversationMetadata> onConversation = invocation.getArgument(2);
            Consumer<String> onDelta = invocation.getArgument(3);
            onConversation.accept(new CopilotConversationMetadata("conv-11"));
            onDelta.accept("完整回答");
            return new CopilotChatResponse("msg-22", "conv-11", "assistant", "完整回答", "22:00");
        }).when(service).stream(eq(7L), any(CopilotChatRequest.class), any(), any());

        MvcResult result = stream(service);

        assertThat(result.getAsyncResult(5_000L)).isNull();
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("event:conversation\ndata:{\"conversationId\":\"conv-11\"}\n\n");
        assertThat(eventNames(body)).containsExactly("conversation", "delta", "complete");
    }

    @Test
    void streamsConversationBeforeErrorWhenFirstProviderChunkFails() throws Exception {
        CopilotService service = mock(CopilotService.class);
        IllegalStateException failure = new IllegalStateException("模型调用失败");
        doAnswer(invocation -> {
            Consumer<CopilotConversationMetadata> onConversation = invocation.getArgument(2);
            onConversation.accept(new CopilotConversationMetadata("conv-11"));
            throw failure;
        }).when(service).stream(eq(7L), any(CopilotChatRequest.class), any(), any());

        MvcResult result = stream(service);

        assertThat(result.getAsyncResult(5_000L)).isSameAs(failure);
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains("event:conversation\ndata:{\"conversationId\":\"conv-11\"}\n\n");
        assertThat(body).contains("模型调用失败");
        assertThat(eventNames(body)).containsExactly("conversation", "error");
    }

    private MvcResult stream(CopilotService service) throws Exception {
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();
        return mvc.perform(post("/copilot/chat/stream")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"prompt\":\"帮我解释错误\"}")
                        .header("X-User-Id", "7"))
                .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
    }

    private List<String> eventNames(String body) {
        return body.lines().filter(line -> line.startsWith("event:"))
                .map(line -> line.substring("event:".length()).trim()).toList();
    }

    @Test
    void returnsStructuredCanvasEditsForAuthenticatedCaller() throws Exception {
        CopilotService service = mock(CopilotService.class);
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("添加开始节点");
        request.setContext(java.util.Map.of("nodes", List.of()));
        var edit = com.aetherflow.ai.copilot.service.CopilotCanvasEdits.parse(
                "{\"status\":\"READY\",\"explanation\":\"添加开始节点\",\"operations\":[{\"type\":\"add_node\",\"nodeId\":\"start-1\",\"kind\":\"start\"}]}");
        when(service.editCanvas(7L, request)).thenReturn(new com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotCanvasEditResponse(
                new CopilotChatResponse("msg-1", "conv-1", "assistant", edit.explanation(), "22:00"), edit));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();
        mvc.perform(post("/copilot/canvas-edit").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)).header("X-User-Id", "7"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.edit.operations[0].kind").value("start"));
        mvc.perform(post("/copilot/canvas-edit").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sendsChatPromptAndReturnsAssistantMessage() throws Exception {
        CopilotService service = mock(CopilotService.class);
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("Which node should I add next?");
        request.setWorkflowId("wf-1001");
        when(service.chat(7L, request)).thenReturn(new CopilotChatResponse(
                "msg-22", "conv-11", "assistant",
                "A solid next node is Summary after Translate.",
                "19:36"
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();

        mockMvc.perform(post("/copilot/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request))
                        .header("X-User-Id", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").value("msg-22"))
                .andExpect(jsonPath("$.data.conversationId").value("conv-11"))
                .andExpect(jsonPath("$.data.role").value("assistant"));

        verify(service).chat(7L, request);
    }

    @Test
    void listsConversationsAndMessages() throws Exception {
        CopilotService service = mock(CopilotService.class);
        when(service.listConversations(7L, 20)).thenReturn(List.of(new CopilotConversationSummary(
                "conv-11", "Which node should I add next?", "wf-1001", "project-1",
                2, "2026-05-29T19:36:00"
        )));
        when(service.listMessages(7L, 11L)).thenReturn(List.of(
                new CopilotMessageResponse("msg-21", "user", "Which node should I add next?", "19:36"),
                new CopilotMessageResponse("msg-22", "assistant", "A solid next node is Summary.", "19:36")
        ));
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();

        mockMvc.perform(get("/copilot/conversations").param("limit", "20").header("X-User-Id", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value("conv-11"))
                .andExpect(jsonPath("$.data[0].messageCount").value(2));

        mockMvc.perform(get("/copilot/conversations/11/messages").header("X-User-Id", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[1].role").value("assistant"));

        verify(service).listConversations(7L, 20);
        verify(service).listMessages(7L, 11L);
    }
}
