package com.aetherflow.ai.copilot.service;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationMetadata;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 使用真实事务模板和模拟事务管理器，验证元数据必须在提交成功后交付。 */
class CopilotConversationMetadataTest {

    private final List<String> order = new ArrayList<>();
    private final List<CopilotConversationMetadata> metadata = new ArrayList<>();
    private final List<CopilotMessageEntity> persistedMessages = new ArrayList<>();
    private final AtomicBoolean transactionActive = new AtomicBoolean();
    private CopilotConversationMapper conversationMapper;
    private AiProviderRouter provider;
    private PlatformTransactionManager transactions;
    private CopilotService service;

    @BeforeEach
    void setUp() {
        conversationMapper = mock(CopilotConversationMapper.class);
        CopilotMessageMapper messages = mock(CopilotMessageMapper.class);
        provider = mock(AiProviderRouter.class);
        transactions = mock(PlatformTransactionManager.class);
        when(transactions.getTransaction(any())).thenAnswer(invocation -> {
            transactionActive.set(true);
            return mock(TransactionStatus.class);
        });
        doAnswer(invocation -> {
            order.add("commit");
            transactionActive.set(false);
            return null;
        }).when(transactions).commit(any());
        doAnswer(invocation -> {
            assertThat(transactionActive).isTrue();
            invocation.<CopilotConversationEntity>getArgument(0).setId(11L);
            order.add("new-conversation");
            return 1;
        }).when(conversationMapper).insert(any(CopilotConversationEntity.class));
        AtomicLong messageIds = new AtomicLong(20L);
        doAnswer(invocation -> {
            assertThat(transactionActive).isTrue();
            CopilotMessageEntity message = invocation.getArgument(0);
            message.setId(messageIds.incrementAndGet());
            persistedMessages.add(message);
            order.add(message.getRole());
            return 1;
        }).when(messages).insert(any(CopilotMessageEntity.class));
        service = new CopilotServiceImpl(conversationMapper, messages, provider,
                new TransactionTemplate(transactions));
    }

    @Test
    void commitsUserMessageBeforeMetadataThenCallsProviderAndPersistsCompletedReply() {
        doAnswer(invocation -> {
            assertThat(transactionActive).isFalse();
            order.add("provider");
            Consumer<AiProviderResponse> onDelta = invocation.getArgument(1);
            onDelta.accept(new AiProviderResponse(AiProviderType.OLLAMA, "model", "完整回答", Map.of()));
            return null;
        }).when(provider).stream(any(AiProviderRequest.class), any());

        var response = service.stream(7L, request(), this::receiveMetadata, this::receiveDelta);

        assertThat(order).containsExactly("new-conversation", "user", "commit", "conversation:conv-11",
                "provider", "delta:完整回答", "assistant", "commit");
        assertThat(response.conversationId()).isEqualTo("conv-11");
        assertThat(response.content()).isEqualTo("完整回答");
        assertThat(metadata).containsExactly(new CopilotConversationMetadata("conv-11"));
    }

    @Test
    void firstChunkFailureStillDeliversConversationAndOnlyPersistsUserMessage() {
        assertProviderFailure(false);
    }

    @Test
    void partialStreamFailureStillDeliversConversationWithoutPersistingPartialReply() {
        assertProviderFailure(true);
    }

    @Test
    void metadataDeliveryFailureStopsBeforeCallingProvider() {
        IllegalStateException failure = new IllegalStateException("元数据发送失败");

        assertThatThrownBy(() -> service.stream(7L, request(), value -> {
            receiveMetadata(value);
            throw failure;
        }, this::receiveDelta)).isSameAs(failure);

        assertThat(order).containsExactly("new-conversation", "user", "commit", "conversation:conv-11");
        assertOnlyUserMessagePersisted();
        verifyNoInteractions(provider);
    }

    @Test
    void providerRequestValidationFailureStillDeliversCommittedConversation() {
        CopilotChatRequest request = request();
        request.setProvider("INVALID_PROVIDER");

        assertThatThrownBy(() -> service.stream(7L, request, this::receiveMetadata, this::receiveDelta))
                .isInstanceOf(BusinessException.class);

        assertThat(order).containsExactly("new-conversation", "user", "commit", "conversation:conv-11");
        assertOnlyUserMessagePersisted();
        verifyNoInteractions(provider);
    }

    @Test
    void failedCommitDoesNotDeliverConversationOrInvokeProvider() {
        IllegalStateException failure = new IllegalStateException("事务提交失败");
        doAnswer(invocation -> { throw failure; }).when(transactions).commit(any());

        assertThatThrownBy(() -> service.stream(7L, request(), this::receiveMetadata, this::receiveDelta))
                .isSameAs(failure);

        assertThat(metadata).isEmpty();
        assertThat(order).containsExactly("new-conversation", "user");
        verifyNoInteractions(provider);
    }

    @Test
    void missingMetadataConsumerIsRejectedBeforeAnyPersistence() {
        assertThatThrownBy(() -> service.stream(7L, request(), null, this::receiveDelta))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("consumer is required");

        assertThat(persistedMessages).isEmpty();
        verifyNoInteractions(transactions, conversationMapper, provider);
    }

    private void assertProviderFailure(boolean afterPartialReply) {
        IllegalStateException failure = new IllegalStateException("模型调用失败");
        doAnswer(invocation -> {
            assertThat(transactionActive).isFalse();
            order.add("provider");
            if (afterPartialReply) {
                Consumer<AiProviderResponse> onDelta = invocation.getArgument(1);
                onDelta.accept(new AiProviderResponse(AiProviderType.OLLAMA, "model", "部分回答", Map.of()));
            }
            throw failure;
        }).when(provider).stream(any(AiProviderRequest.class), any());

        assertThatThrownBy(() -> service.stream(7L, request(), this::receiveMetadata, this::receiveDelta))
                .isSameAs(failure);

        List<String> expected = new ArrayList<>(List.of(
                "new-conversation", "user", "commit", "conversation:conv-11", "provider"));
        if (afterPartialReply) {
            expected.add("delta:部分回答");
        }
        assertThat(order).containsExactlyElementsOf(expected);
        assertThat(metadata).containsExactly(new CopilotConversationMetadata("conv-11"));
        assertOnlyUserMessagePersisted();
    }

    private void assertOnlyUserMessagePersisted() {
        assertThat(persistedMessages).singleElement().satisfies(message -> {
            assertThat(message.getRole()).isEqualTo("user");
            assertThat(message.getConversationId()).isEqualTo(11L);
            assertThat(message.getContent()).isEqualTo("帮我解释错误");
        });
        verify(conversationMapper, never()).updateById(any(CopilotConversationEntity.class));
    }

    private void receiveMetadata(CopilotConversationMetadata value) {
        assertThat(transactionActive).isFalse();
        metadata.add(value);
        order.add("conversation:" + value.conversationId());
    }

    private void receiveDelta(String value) {
        order.add("delta:" + value);
    }

    private CopilotChatRequest request() {
        CopilotChatRequest request = new CopilotChatRequest();
        request.setPrompt("帮我解释错误");
        return request;
    }
}
