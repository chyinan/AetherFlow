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

        CopilotChatResponse response = service.chat(request);

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
        when(conversationMapper.selectById(11L)).thenReturn(conversation);
        doAnswer(invocation -> {
            CopilotMessageEntity entity = invocation.getArgument(0);
            entity.setId("assistant".equals(entity.getRole()) ? 22L : 21L);
            return 1;
        }).when(messageMapper).insert(any(CopilotMessageEntity.class));
        CopilotChatRequest request = new CopilotChatRequest();
        request.setConversationId("conv-11");
        request.setPrompt("Explain the latest error");

        CopilotChatResponse response = service.chat(request);

        assertThat(response.conversationId()).isEqualTo("conv-11");
        assertThat(response.content()).contains("Whisper runtime");
        verify(conversationMapper, never()).insert(any(CopilotConversationEntity.class));
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

        CopilotChatResponse response = service.chat(request);

        assertThat(response.content()).contains("qwen3.5");
        ArgumentCaptor<AiProviderRequest> requestCaptor = ArgumentCaptor.forClass(AiProviderRequest.class);
        verify(aiProviderRouter).complete(requestCaptor.capture());
        assertThat(requestCaptor.getValue().provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(requestCaptor.getValue().model()).isEqualTo("qwen3.5:9b");
        assertThat(requestCaptor.getValue().prompt()).contains("AetherFlow workflow copilot", "帮我解释最新错误");
    }

    @Test
    void rejectsBlankPrompt() {
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt(" ");

        assertThatThrownBy(() -> service.chat(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("copilot prompt is required");
    }

    @Test
    void listsConversationsAndMessages() {
        CopilotConversationEntity conversation = conversation(11L);
        when(conversationMapper.selectList(any(Wrapper.class))).thenReturn(List.of(conversation));
        CopilotMessageEntity user = message(21L, 11L, "user", "Which node should I add next?");
        CopilotMessageEntity assistant = message(22L, 11L, "assistant", "A solid next node is Summary.");
        when(messageMapper.selectList(any(Wrapper.class))).thenReturn(List.of(user, assistant));

        List<CopilotConversationSummary> conversations = service.listConversations(20);
        List<CopilotMessageResponse> messages = service.listMessages(11L);

        assertThat(conversations).extracting(CopilotConversationSummary::id).containsExactly("conv-11");
        assertThat(messages).extracting(CopilotMessageResponse::role).containsExactly("user", "assistant");
    }

    private CopilotConversationEntity conversation(Long id) {
        CopilotConversationEntity conversation = new CopilotConversationEntity();
        conversation.setId(id);
        conversation.setTitle("Which node should I add next?");
        conversation.setWorkflowId("wf-1001");
        conversation.setProjectId("project-1");
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
}
