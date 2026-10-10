package com.aetherflow.ai.copilot.service;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.entity.CopilotConversationEntity;
import com.aetherflow.ai.copilot.entity.CopilotMessageEntity;
import com.aetherflow.ai.copilot.mapper.CopilotConversationMapper;
import com.aetherflow.ai.copilot.mapper.CopilotMessageMapper;
import com.aetherflow.ai.copilot.service.impl.CopilotServiceImpl;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CopilotServiceImplTest {

    @Mock
    private CopilotConversationMapper conversationMapper;

    @Mock
    private CopilotMessageMapper messageMapper;

    @Mock
    private AiProviderRouter aiProviderRouter;

    @Mock
    private TransactionTemplate transactionTemplate;

    private CopilotServiceImpl service;

    @BeforeEach
    void setUp() {
        // Run the transaction callback inline so the unit tests exercise the actual
        // DB-only logic without a real PlatformTransactionManager. Lenient because
        // tests like rejectsBlankPrompt() return before reaching the transaction.
        lenient().when(transactionTemplate.execute(any(TransactionCallback.class)))
                .thenAnswer(invocation -> invocation.<TransactionCallback<?>>getArgument(0).doInTransaction(null));
        service = new CopilotServiceImpl(conversationMapper, messageMapper, aiProviderRouter, transactionTemplate);
    }

    @Test
    void canvasEditPersistsUserTextAndExplanationWithoutPersistingInternalInstructions() {
        stubAiReply("{\"status\":\"READY\",\"explanation\":\"添加开始节点\",\"operations\":[{\"type\":\"add_node\",\"nodeId\":\"start-1\",\"kind\":\"start\"}]}");
        doAnswer(invocation -> {
            CopilotConversationEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        AtomicLong messageIds = new AtomicLong(20);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId(messageIds.incrementAndGet());
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("添加开始节点");
        request.setContext(java.util.Map.of("nodes", List.of(), "nodeCatalog", List.of(java.util.Map.of("kind", "start"))));

        var response = service.editCanvas(7L, request);
        assertThat(response.edit().operations()).hasSize(1);
        assertThat(response.message().conversationId()).isEqualTo("conv-11");
        ArgumentCaptor<CopilotMessageEntity> persisted = ArgumentCaptor.forClass(CopilotMessageEntity.class);
        verify(messageMapper, org.mockito.Mockito.times(2)).insert(persisted.capture());
        assertThat(persisted.getAllValues()).extracting(CopilotMessageEntity::getContent)
                .containsExactly("添加开始节点", "添加开始节点");
        ArgumentCaptor<AiProviderRequest> provider = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(provider.capture());
        assertThat(provider.getValue().prompt()).contains("结构化操作直接编辑当前画布", "nodeCatalog");
    }

    @Test
    void chatCreatesConversationAndPersistsUserAndAssistantMessages() {
        stubAiReply("Add a Summary node after Whisper.");
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("Which node should I add next?");
        request.setWorkflowId("wf-1001");
        request.setProjectId("project-1");
        doAnswer(invocation -> {
            CopilotConversationEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        AtomicLong messageIds = new AtomicLong(20);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId(messageIds.incrementAndGet());
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));

        CopilotChatResponse response = service.chat(7L, request);

        assertThat(response.conversationId()).isEqualTo("conv-11");
        assertThat(response.role()).isEqualTo("assistant");
        assertThat(response.content()).contains("Summary node");
        ArgumentCaptor<CopilotMessageEntity> messageCaptor = ArgumentCaptor.forClass(CopilotMessageEntity.class);
        verify(messageMapper, org.mockito.Mockito.times(2)).insert(messageCaptor.capture());
        assertThat(messageCaptor.getAllValues()).extracting(CopilotMessageEntity::getRole)
                .containsExactly("user", "assistant");
        verify(conversationMapper).updateById(any(CopilotConversationEntity.class));
    }

    @Test
    void chatReusesExistingConversation() {
        stubAiReply("The latest error is from the Whisper runtime.");
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 22L : 21L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setPrompt("Explain the latest error");

        CopilotChatResponse response = service.chat(7L, request);

        assertThat(response.conversationId()).isEqualTo("conv-11");
        assertThat(response.content()).contains("Whisper runtime");
        verify(conversationMapper, never()).insert(any(CopilotConversationEntity.class));
    }

    @Test
    void chatIncludesPreviousMessagesInProviderPrompt() {
        stubAiReply("继续使用 Summary 节点。");
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of(
                message(21L, 11L, "user", "我想把转写结果整理成会议纪要"),
                message(22L, 11L, "assistant", "可以在 Whisper 后添加 Summary 节点。")
        ));
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 24L : 23L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));

        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setWorkflowId("wf-1001");
        request.setPrompt("那下一步怎么配置？");

        service.chat(7L, request);

        ArgumentCaptor<AiProviderRequest> requestCaptor = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(requestCaptor.capture());
        assertThat(requestCaptor.getValue().prompt())
                .contains("我想把转写结果整理成会议纪要")
                .contains("可以在 Whisper 后添加 Summary 节点。")
                .contains("那下一步怎么配置？");
    }

    @Test
    void rejectsConversationFromAnotherWorkflow() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setWorkflowId("wf-other");
        request.setPrompt("继续刚才的话题");

        assertThatThrownBy(() -> service.chat(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow");

        verify(aiProviderRouter, never()).complete(any(AiProviderRequest.class));
    }

    @Test
    void chatPassesRequestedProviderAndModelToAiProviderRouter() {
        stubAiReply("Use Ollama qwen3.5 for this workflow suggestion.");
        doAnswer(invocation -> {
            CopilotConversationEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 22L : 21L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("帮我解释最新错误");
        request.setProvider("OLLAMA");
        request.setModel("qwen3.5:9b");

        CopilotChatResponse response = service.chat(7L, request);

        assertThat(response.content()).contains("qwen3.5");
        ArgumentCaptor<AiProviderRequest> requestCaptor = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(requestCaptor.capture());
        assertThat(requestCaptor.getValue().provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(requestCaptor.getValue().model()).isEqualTo("qwen3.5:9b");
        assertThat(requestCaptor.getValue().prompt()).contains("AetherFlow workflow copilot", "帮我解释最新错误");
    }

    @Test
    void workflowPlannerPersistsStrictStructuredPlanAndRedactsUnapprovedContext() {
        stubAiReply(validMediaPlanJson("Chinese", "Focus on decisions"));
        stubNewConversationAndMessages();
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("帮我规划一个会议录音摘要流程");
        request.setWorkflowId("wf-1001");
        request.setContext(java.util.Map.of(
                "workflowName", "Meeting notes",
                "availableNodeKinds", List.of("start", "upload", "summary"),
                "config", java.util.Map.of("apiKey", "should-not-reach-provider"),
                "password", "should-not-reach-provider"
        ));

        CopilotChatResponse response = service.planWorkflow(7L, request);

        assertThat(response.plan()).isNotNull();
        assertThat(response.plan().status().name()).isEqualTo("READY");
        assertThat(response.plan().recipe().name()).isEqualTo("MEDIA_SUMMARY");
        assertThat(response.conversationId()).isEqualTo("conv-11");
        ArgumentCaptor<AiProviderRequest> providerRequest = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(providerRequest.capture());
        assertThat(providerRequest.getValue().prompt())
                .contains("Latest user turn", "Meeting notes", "MEDIA_SUMMARY")
                .doesNotContain("should-not-reach-provider", "apiKey", "password");
        ArgumentCaptor<CopilotMessageEntity> messages = ArgumentCaptor.forClass(CopilotMessageEntity.class);
        verify(messageMapper, org.mockito.Mockito.times(2)).insert(messages.capture());
        CopilotMessageEntity persistedPlan = messages.getAllValues().get(1);
        assertThat(persistedPlan.getRole()).isEqualTo("assistant");
        assertThat(persistedPlan.getPlanJson()).contains("MEDIA_SUMMARY", "Focus on decisions");
        verify(messageMapper).updateById(persistedPlan);
    }

    @Test
    void workflowPlannerCarriesForwardTheLatestPersistedRequirements() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        when(conversationMapper.selectOwnedForUpdate(11L, 7L)).thenReturn(conversation);
        CopilotMessageEntity previous = message(22L, 11L, "assistant", "已生成会议摘要计划");
        previous.setPlanJson(validMediaPlanJson("Chinese", "Keep decisions and owners"));
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of(previous));
        stubAiReply(validMediaPlanJson("English", "Keep decisions and owners"));
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 24L : 23L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setWorkflowId("wf-1001");
        request.setPrompt("把摘要语言改成 English");

        CopilotChatResponse response = service.planWorkflow(7L, request);

        assertThat(response.plan().requirements().language()).isEqualTo("English");
        ArgumentCaptor<AiProviderRequest> providerRequest = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(providerRequest.capture());
        assertThat(providerRequest.getValue().prompt())
                .contains("Latest persisted structured plan", "Keep decisions and owners", "把摘要语言改成 English");
    }

    @Test
    void workflowPlannerLoadsTheLatestPlanOutsideTheBoundedChatHistoryWindow() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        when(conversationMapper.selectOwnedForUpdate(11L, 7L)).thenReturn(conversation);
        List<CopilotMessageEntity> recent = new java.util.ArrayList<>();
        for (long id = 40; id < 60; id++) {
            recent.add(message(id, 11L, id % 2 == 0 ? "assistant" : "user", "ordinary chat turn"));
        }
        CopilotMessageEntity latestPlan = message(22L, 11L, "assistant", "Plan from before the chat window");
        latestPlan.setPlanJson(validMediaPlanJson("Chinese", "Preserve the current requirements"));
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(recent, List.of(latestPlan));
        stubAiReply(validMediaPlanJson("English", "Preserve the current requirements"));
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 62L : 61L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setWorkflowId("wf-1001");
        request.setPrompt("Change the output language to English");

        service.planWorkflow(7L, request);

        ArgumentCaptor<AiProviderRequest> providerRequest = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(providerRequest.capture());
        assertThat(providerRequest.getValue().prompt())
                .contains("Latest persisted structured plan", "Preserve the current requirements");
    }

    @Test
    void workflowPlannerRejectsOutOfOrderConcurrentCompletion() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);
        when(conversationMapper.selectOwnedForUpdate(11L, 7L)).thenReturn(conversation);
        CopilotMessageEntity basePlan = message(22L, 11L, "assistant", "Plan before concurrent turns");
        basePlan.setPlanJson(validMediaPlanJson("Chinese", "Keep existing fields"));
        CopilotMessageEntity concurrentPlan = message(25L, 11L, "assistant", "Newer planner response");
        concurrentPlan.setPlanJson(validMediaPlanJson("English", "Keep existing fields"));
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of(basePlan), List.of(concurrentPlan));
        stubAiReply(validMediaPlanJson("French", "Keep existing fields"));
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId(23L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setWorkflowId("wf-1001");
        request.setPrompt("Change the summary language to French");

        assertThatThrownBy(() -> service.planWorkflow(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("state changed");

        verify(messageMapper, org.mockito.Mockito.times(1)).insert(any(CopilotMessageEntity.class));
        verify(messageMapper, never()).updateById(any(CopilotMessageEntity.class));
    }

    @Test
    void workflowPlannerRejectsMalformedOrUnboundedModelOutputBeforePersistingAssistantPlan() {
        stubAiReply("```json\n{\"status\":\"READY\", \"recipe\":\"CODE\"}\n```");
        stubNewConversationAndMessages();
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("Create a safe summary flow");

        assertThatThrownBy(() -> service.planWorkflow(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("malformed structured output");

        verify(messageMapper, org.mockito.Mockito.times(1)).insert(any(CopilotMessageEntity.class));
        verify(messageMapper, never()).updateById(any(CopilotMessageEntity.class));
    }

    @Test
    void workflowPlannerRejectsMissingSchemaFieldsAndBlankPlanSteps() {
        stubAiReply("{\"status\":\"READY\",\"requirements\":{},\"recipe\":\"MEDIA_SUMMARY\",\"steps\":[\"\",\"\",\"\"],\"explanation\":\"Plan\",\"clarifyingQuestion\":null,\"assumptions\":[]}");
        stubNewConversationAndMessages();
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("Create a media summary flow");

        assertThatThrownBy(() -> service.planWorkflow(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("invalid structured plan");
        verify(messageMapper, org.mockito.Mockito.times(1)).insert(any(CopilotMessageEntity.class));
        verify(messageMapper, never()).updateById(any(CopilotMessageEntity.class));
    }

    @Test
    void streamPersistsTheCombinedAssistantReplyAndForwardsEachDelta() {
        doAnswer(invocation -> {
            java.util.function.Consumer<AiProviderResponse> consumer = invocation.getArgument(1);
            consumer.accept(new AiProviderResponse(AiProviderType.OLLAMA, "qwen3.5:9b", "第一段", java.util.Map.of()));
            consumer.accept(new AiProviderResponse(AiProviderType.OLLAMA, "qwen3.5:9b", "第二段", java.util.Map.of()));
            return null;
        }).when(aiProviderRouter).stream(any(AiProviderRequest.class), any());
        doAnswer(invocation -> {
            CopilotConversationEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        AtomicLong messageIds = new AtomicLong(20);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId(messageIds.incrementAndGet());
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("流式解释最新错误");
        List<String> chunks = new java.util.ArrayList<>();

        CopilotChatResponse response = service.stream(7L, request, chunks::add);

        assertThat(chunks).containsExactly("第一段", "第二段");
        assertThat(response.content()).isEqualTo("第一段第二段");
        verify(messageMapper, org.mockito.Mockito.times(2)).insert(any(CopilotMessageEntity.class));
    }

    @Test
    void rejectsBlankPrompt() {
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt(" ");

        assertThatThrownBy(() -> service.chat(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("copilot prompt is required");
    }

    @Test
    void rejectsConversationOwnedByAnotherUser() {
        CopilotConversationEntity conversation = conversation(11L);
        conversation.setUserId(99L);
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(null);
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setPrompt("Read the previous conversation");

        assertThatThrownBy(() -> service.chat(7L, request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("copilot conversation not found");

        verify(conversationMapper, never()).selectById(11L);
        verify(conversationMapper).selectOne(any(Wrapper.class));
    }

    @Test
    void listsConversationsAndMessages() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectList(any(Wrapper.class))).thenReturn(List.of(conversation));
        CopilotMessageEntity user = message(21L, 11L, "user", "Which node should I add next?");
        CopilotMessageEntity assistant = message(22L, 11L, "assistant", "A solid next node is Summary.");
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of(user, assistant));
        when(conversationMapper.selectOne(any(Wrapper.class))).thenReturn(conversation);

        List<CopilotConversationSummary> conversations = service.listConversations(7L, 20);
        List<CopilotMessageResponse> messages = service.listMessages(7L, 11L);

        assertThat(conversations).extracting(CopilotConversationSummary::id).containsExactly("conv-11");
        assertThat(messages).extracting(CopilotMessageResponse::role).containsExactly("user", "assistant");
    }

    private CopilotConversationEntity conversation(Long id) {
        CopilotConversationEntity conversation = new CopilotConversationEntity();
        conversation.setId(id);
        conversation.setTitle("Which node should I add next?");
        conversation.setWorkflowId("wf-1001");
        conversation.setProjectId("project-1");
        conversation.setUserId(7L);
        conversation.setStatus("active");
        conversation.setMessageCount(2);
        conversation.setLastMessageAt(LocalDateTime.parse("2026-05-29T19:36:00"));
        return conversation;
    }

    private CopilotMessageEntity message(Long id, Long conversationId, String role, String content) {
        CopilotMessageEntity message = new CopilotMessageEntity();
        message.setId(id);
        message.setConversationId(conversationId);
        message.setRole(role);
        message.setContent(content);
        message.setCreatedAt(LocalDateTime.parse("2026-05-29T19:36:00"));
        return message;
    }

    private void stubAiReply(String text) {
        when(aiProviderRouter.complete(any(AiProviderRequest.class)))
                .thenReturn(new AiProviderResponse(AiProviderType.OLLAMA, "qwen3.5:9b", text, java.util.Map.of()));
    }

    private void stubNewConversationAndMessages() {
        doAnswer(invocation -> {
            CopilotConversationEntity entity = invocation.getArgument(0);
            entity.setId(11L);
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        when(conversationMapper.selectOwnedForUpdate(11L, 7L)).thenReturn(conversation(11L));
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of());
        AtomicLong ids = new AtomicLong(20);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId(ids.incrementAndGet());
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
    }

    private String validMediaPlanJson(String language, String instruction) {
        return """
                {"status":"READY","requirements":{"goal":"Summarize a meeting recording","inputKind":"MEDIA_FILE","inputDescription":"Audio or video supplied at run time","outputFormat":"Markdown","language":"%s","audience":"Project team","instruction":"%s","constraints":["Keep decisions and action owners"]},"recipe":"MEDIA_SUMMARY","steps":["Accept a media file at workflow start","Load its metadata and extract audio","Transcribe the recording","Create a readable summary","Export the summary and return it"],"explanation":"I’ll create a media summary flow with a run-time file input.","clarifyingQuestion":null,"assumptions":["The source file is supplied when the workflow runs"]}
                """.formatted(language, instruction);
    }
}
