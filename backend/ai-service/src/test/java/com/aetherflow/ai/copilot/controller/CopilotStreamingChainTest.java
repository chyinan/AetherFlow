package com.aetherflow.ai.copilot.controller;

import com.aetherflow.ai.config.PythonAiProperties;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.entity.CopilotConversationEntity;
import com.aetherflow.ai.copilot.entity.CopilotMessageEntity;
import com.aetherflow.ai.copilot.mapper.CopilotConversationMapper;
import com.aetherflow.ai.copilot.mapper.CopilotMessageMapper;
import com.aetherflow.ai.copilot.service.impl.CopilotServiceImpl;
import com.aetherflow.ai.provider.AIInferenceLogService;
import com.aetherflow.ai.provider.AiProvider;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.ai.provider.ProviderCallPermission;
import com.aetherflow.ai.provider.ProviderCircuitBreaker;
import com.aetherflow.ai.provider.ProviderCircuitSnapshot;
import com.aetherflow.ai.provider.ProviderMetricsService;
import com.aetherflow.ai.provider.ProviderPricingSnapshotService;
import com.aetherflow.ai.provider.ProviderRoutingPolicy;
import com.aetherflow.ai.provider.ProviderRoutingPolicyService;
import com.aetherflow.ai.provider.ProviderStateRepository;
import com.aetherflow.ai.provider.PythonAiInferenceClientFactory;
import com.aetherflow.ai.provider.PythonRuntimeAiProvider;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.client.RestClient;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 使用本机可控 SSE 上游，贯穿真实 provider、router、service 和 MVC 控制器；数据库使用测试替身。 */
class CopilotStreamingChainTest {

    private static final String TIMEOUT_EVENT = "event: error\ndata: {\"error\":{\"code\":\"deadline_exceeded\","
            + "\"message\":\"LLM provider deadline exceeded\"}}\n\n";
    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final AtomicReference<String> upstreamEvents = new AtomicReference<>("");
    private HttpServer server;
    private MockMvc mvc;
    private CopilotConversationMapper conversationMapper;
    private CopilotMessageMapper messageMapper;
    private ProviderMetricsService metrics;
    private AiProvider fallback;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/llm/chat/stream", exchange -> {
            try {
                exchange.getRequestBody().readAllBytes();
                byte[] body = upstreamEvents.get().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=UTF-8");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } finally {
                exchange.close();
            }
        });
        server.start();
        PythonAiProperties properties = new PythonAiProperties();
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        PythonAiInferenceClientFactory factory = new PythonAiInferenceClientFactory(RestClient.builder(), properties);
        SentinelAiGuard guard = new SentinelAiGuard();
        AiProvider primary = new PythonRuntimeAiProvider(RestClient.create(), factory, guard, objectMapper) {
            @Override
            public AiProviderType type() {
                return AiProviderType.OPENAI;
            }
        };
        fallback = mock(AiProvider.class);
        when(fallback.type()).thenReturn(AiProviderType.OLLAMA);
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA));
        ProviderRoutingPolicyService policyService = mock(ProviderRoutingPolicyService.class);
        when(policyService.currentPolicy(7L)).thenReturn(policy);
        ProviderCircuitBreaker circuitBreaker = mock(ProviderCircuitBreaker.class);
        when(circuitBreaker.beforeCall(any(), eq(policy))).thenAnswer(invocation ->
                ProviderCallPermission.allow(ProviderCircuitSnapshot.closed(invocation.getArgument(0)), false));
        metrics = mock(ProviderMetricsService.class);
        AiProviderRouter router = new AiProviderRouter(List.of(primary, fallback), policyService, circuitBreaker,
                mock(ProviderStateRepository.class), metrics, mock(AIInferenceLogService.class), guard,
                mock(ProviderPricingSnapshotService.class));

        conversationMapper = mock(CopilotConversationMapper.class);
        messageMapper = mock(CopilotMessageMapper.class);
        doAnswer(invocation -> {
            invocation.<CopilotConversationEntity>getArgument(0).setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        AtomicLong messageIds = new AtomicLong(20L);
        doAnswer(invocation -> {
            invocation.<CopilotMessageEntity>getArgument(0).setId(messageIds.incrementAndGet());
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        TransactionTemplate transactions = mock(TransactionTemplate.class);
        when(transactions.execute(any(TransactionCallback.class))).thenAnswer(invocation ->
                invocation.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        CopilotServiceImpl service = new CopilotServiceImpl(conversationMapper, messageMapper, router, transactions);
        mvc = MockMvcBuilders.standaloneSetup(new CopilotController(service)).build();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void preservesWhitespaceChunksThroughHttpRoutingSseAndPersistence() throws Exception {
        List<String> chunks = List.of(" ", "你好", " ", " ", "world", "\n", "\n", "\t", "  ", "代码", "\r\n");
        upstreamEvents.set(frames(chunks) + "data: {\"text\":\"\",\"metadata\":{}}\n\n"
                + "data: {\"text\":null,\"metadata\":{}}\n\ndata: [DONE]\n\n");

        MvcResult result = stream();

        assertThat(result.getAsyncResult(5_000L)).isNull();
        List<StreamEvent> events = events(result);
        assertThat(deltas(events)).containsExactlyElementsOf(chunks);
        assertThat(events).filteredOn(event -> event.name().equals("complete"))
                .singleElement().satisfies(event -> assertThat(event.data().path("content").asText())
                        .isEqualTo(String.join("", chunks)));
        assertThat(events).noneMatch(event -> event.name().equals("error"));
        ArgumentCaptor<CopilotMessageEntity> messages = ArgumentCaptor.forClass(CopilotMessageEntity.class);
        verify(messageMapper, times(2)).insert(messages.capture());
        assertThat(messages.getAllValues().get(1).getContent()).isEqualTo(String.join("", chunks));
        verify(metrics).recordSuccess(eq(AiProviderType.OPENAI), any());
        verify(fallback, never()).stream(any(), any());
    }

    @Test
    void timeoutAfterPartialTextProducesErrorWithoutCompletionOrAssistantPersistence() throws Exception {
        upstreamEvents.set(frames(List.of("部分", " ", "回答")) + TIMEOUT_EVENT + "data: [DONE]\n\n");

        MvcResult result = stream();

        assertFailed(result, "LLM provider deadline exceeded", List.of("部分", " ", "回答"));
        verify(metrics).recordFailure(eq(AiProviderType.OPENAI), any(), any());
        verify(metrics, never()).recordSuccess(eq(AiProviderType.OPENAI), any());
        verify(fallback, never()).stream(any(), any());
    }

    @Test
    void timeoutAfterWhitespaceDoesNotMixInFallbackResponse() throws Exception {
        upstreamEvents.set(frames(List.of(" \n\t")) + TIMEOUT_EVENT);

        assertFailed(stream(), "LLM provider deadline exceeded", List.of(" \n\t"));

        verify(fallback, never()).stream(any(), any());
    }

    @Test
    void timeoutBeforeFirstChunkCanUseConfiguredFallback() throws Exception {
        upstreamEvents.set(TIMEOUT_EVENT);
        doAnswer(invocation -> {
            Consumer<AiProviderResponse> consumer = invocation.getArgument(1);
            consumer.accept(new AiProviderResponse(AiProviderType.OLLAMA, "fake-model", "备用回答", Map.of()));
            return null;
        }).when(fallback).stream(any(AiProviderRequest.class), any());

        MvcResult result = stream();

        assertThat(result.getAsyncResult(5_000L)).isNull();
        assertThat(deltas(events(result))).containsExactly("备用回答");
        assertThat(events(result)).extracting(StreamEvent::name).containsExactly("delta", "complete");
        verify(metrics).recordFailure(eq(AiProviderType.OPENAI), any(), any());
        verify(metrics, never()).recordSuccess(eq(AiProviderType.OPENAI), any());
        verify(metrics).recordSuccess(eq(AiProviderType.OLLAMA), any());
        verify(messageMapper, times(2)).insert(any(CopilotMessageEntity.class));
    }

    @Test
    void truncatedUpstreamCannotCompleteOrPersistPartialAnswer() throws Exception {
        upstreamEvents.set(frames(List.of("部分回答")));

        assertFailed(stream(), "stream ended before completion", List.of("部分回答"));

        verify(fallback, never()).stream(any(), any());
    }

    @Test
    void whitespaceOnlyCompletedStreamRemainsAnEmptyResponseFailure() throws Exception {
        upstreamEvents.set(frames(List.of(" ", "\n", "\t")) + "data: [DONE]\n\n");

        assertFailed(stream(), "copilot llm response is empty", List.of(" ", "\n", "\t"));
    }

    @Test
    void emptyCompletedStreamRemainsAnEmptyResponseFailure() throws Exception {
        upstreamEvents.set("data: [DONE]\n\n");

        assertFailed(stream(), "copilot llm response is empty", List.of());
    }

    private MvcResult stream() throws Exception {
        CopilotChatRequest body = new CopilotChatRequest();
        body.setPrompt("请保留完整格式回答");
        body.setModel("fake-model");
        return mvc.perform(post("/copilot/chat/stream").contentType(MediaType.APPLICATION_JSON)
                        .header("X-User-Id", "7").content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
    }

    private void assertFailed(MvcResult result, String message, List<String> expectedChunks) throws Exception {
        assertThat(result.getAsyncResult(5_000L)).isInstanceOf(BusinessException.class);
        List<StreamEvent> events = events(result);
        assertThat(deltas(events)).containsExactlyElementsOf(expectedChunks);
        assertThat(events).filteredOn(event -> event.name().equals("error"))
                .singleElement().satisfies(event -> assertThat(event.data().path("message").asText()).contains(message));
        assertThat(events).noneMatch(event -> event.name().equals("complete"));
        ArgumentCaptor<CopilotMessageEntity> messages = ArgumentCaptor.forClass(CopilotMessageEntity.class);
        verify(messageMapper).insert(messages.capture());
        assertThat(messages.getValue().getRole()).isEqualTo("user");
        verify(conversationMapper, never()).updateById(any(CopilotConversationEntity.class));
    }

    private String frames(List<String> chunks) throws Exception {
        StringBuilder result = new StringBuilder();
        for (String chunk : chunks) {
            result.append("data: ").append(objectMapper.writeValueAsString(
                    Map.of("text", chunk, "model", "fake-model", "metadata", Map.of()))).append("\n\n");
        }
        return result.toString();
    }

    private List<StreamEvent> events(MvcResult result) throws Exception {
        List<StreamEvent> events = new ArrayList<>();
        for (String block : result.getResponse().getContentAsString(StandardCharsets.UTF_8).split("\n\n")) {
            String name = null;
            String data = null;
            for (String line : block.split("\n")) {
                if (line.startsWith("event:")) {
                    name = line.substring("event:".length()).trim();
                } else if (line.startsWith("data:")) {
                    data = line.substring("data:".length()).trim();
                }
            }
            if (name != null && data != null) {
                events.add(new StreamEvent(name, objectMapper.readTree(data)));
            }
        }
        return events;
    }

    private List<String> deltas(List<StreamEvent> events) {
        return events.stream().filter(event -> event.name().equals("delta"))
                .map(event -> event.data().path("content").asText()).toList();
    }

    private record StreamEvent(String name, JsonNode data) {
    }
}
