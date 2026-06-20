package com.aetherflow.ai.copilot.service.impl;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;
import com.aetherflow.ai.copilot.entity.CopilotConversationEntity;
import com.aetherflow.ai.copilot.entity.CopilotMessageEntity;
import com.aetherflow.ai.copilot.mapper.CopilotConversationMapper;
import com.aetherflow.ai.copilot.mapper.CopilotMessageMapper;
import com.aetherflow.ai.copilot.service.CopilotService;
import com.aetherflow.ai.provider.AiProviderRequest;
import com.aetherflow.ai.provider.AiProviderResponse;
import com.aetherflow.ai.provider.AiProviderRouter;
import com.aetherflow.ai.provider.AiProviderType;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class CopilotServiceImpl implements CopilotService {

    private static final String STATUS_ACTIVE = "active";
    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final DateTimeFormatter MESSAGE_TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private static final Duration COPILOT_TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_CONTEXT_ENTRIES = 12;
    private static final int MAX_CONTEXT_VALUE_LENGTH = 600;

    private final CopilotConversationMapper conversationMapper;
    private final CopilotMessageMapper messageMapper;
    private final AiProviderRouter aiProviderRouter;
    private final TransactionTemplate transactionTemplate;

    public CopilotServiceImpl(CopilotConversationMapper conversationMapper,
                              CopilotMessageMapper messageMapper,
                              AiProviderRouter aiProviderRouter,
                              TransactionTemplate transactionTemplate) {
        this.conversationMapper = conversationMapper;
        this.messageMapper = messageMapper;
        this.aiProviderRouter = aiProviderRouter;
        this.transactionTemplate = transactionTemplate;
    }

    /**
     * Splits the chat turn into two short DB transactions with the (up to 60s) LLM
     * call performed outside any transaction, so a slow AI provider can no longer
     * hold a JDBC connection from the pool while waiting for the response.
     *
     * <ol>
     *   <li>Tx 1: resolve/create the conversation and persist the user message.</li>
     *   <li>Non-tx: invoke the AI provider and obtain the assistant reply.</li>
     *   <li>Tx 2: persist the assistant message and update the conversation counters.</li>
     * </ol>
     * If the AI call fails the user prompt is still retained (its own transaction
     * already committed) and the exception bubbles up to the caller.
     */
    @Override
    public CopilotChatResponse chat(CopilotChatRequest request) {
        if (request == null || !hasText(request.getPrompt())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot prompt is required");
        }
        PreparedTurn prepared = transactionTemplate.execute(status -> prepareTurn(request));
        String assistantContent = assistantReply(request);
        CopilotMessageEntity assistantMessage = transactionTemplate.execute(status ->
                persistAssistantReply(prepared, assistantContent));

        return new CopilotChatResponse(
                messageId(assistantMessage.getId()),
                conversationId(prepared.conversation().getId()),
                ROLE_ASSISTANT,
                assistantMessage.getContent(),
                formatMessageTime(assistantMessage.getCreatedAt())
        );
    }

    private PreparedTurn prepareTurn(CopilotChatRequest request) {
        CopilotConversationEntity conversation = resolveConversation(request);
        LocalDateTime now = LocalDateTime.now();
        insertMessage(conversation.getId(), ROLE_USER, request.getPrompt(), now);
        return new PreparedTurn(conversation, now);
    }

    private CopilotMessageEntity persistAssistantReply(PreparedTurn prepared, String assistantContent) {
        CopilotConversationEntity conversation = prepared.conversation();
        CopilotMessageEntity assistantMessage = insertMessage(
                conversation.getId(), ROLE_ASSISTANT, assistantContent, prepared.now());
        conversation.setMessageCount(defaultNumber(conversation.getMessageCount(), 0) + 2);
        conversation.setLastMessageAt(prepared.now());
        conversation.setUpdatedAt(LocalDateTime.now());
        conversationMapper.updateById(conversation);
        return assistantMessage;
    }

    private record PreparedTurn(CopilotConversationEntity conversation, LocalDateTime now) {
    }

    @Override
    public List<CopilotConversationSummary> listConversations(int limit) {
        int safeLimit = limit <= 0 ? 20 : Math.min(limit, 100);
        LambdaQueryWrapper<CopilotConversationEntity> wrapper = new LambdaQueryWrapper<CopilotConversationEntity>()
                .eq(CopilotConversationEntity::getStatus, STATUS_ACTIVE)
                .orderByDesc(CopilotConversationEntity::getLastMessageAt)
                .orderByDesc(CopilotConversationEntity::getId)
                .last("limit " + safeLimit);
        return conversationMapper.selectList(wrapper).stream()
                .map(this::toConversationSummary)
                .toList();
    }

    @Override
    public List<CopilotMessageResponse> listMessages(Long conversationId) {
        LambdaQueryWrapper<CopilotMessageEntity> wrapper = new LambdaQueryWrapper<CopilotMessageEntity>()
                .eq(CopilotMessageEntity::getConversationId, conversationId)
                .orderByAsc(CopilotMessageEntity::getId);
        return messageMapper.selectList(wrapper).stream()
                .map(this::toMessageResponse)
                .toList();
    }

    private CopilotConversationEntity resolveConversation(CopilotChatRequest request) {
        Long conversationId = parseConversationId(request.getConversationId());
        if (conversationId != null) {
            CopilotConversationEntity existing = conversationMapper.selectById(conversationId);
            if (existing == null) {
                throw new BusinessException(ResultCode.NOT_FOUND, "copilot conversation not found");
            }
            return existing;
        }
        return createConversation(request);
    }

    private CopilotConversationEntity createConversation(CopilotChatRequest request) {
        LocalDateTime now = LocalDateTime.now();
        CopilotConversationEntity conversation = new CopilotConversationEntity();
        conversation.setTitle(titleFromPrompt(request.getPrompt()));
        conversation.setWorkflowId(request.getWorkflowId());
        conversation.setProjectId(request.getProjectId());
        conversation.setStatus(STATUS_ACTIVE);
        conversation.setMessageCount(0);
        conversation.setLastMessageAt(now);
        conversation.setCreatedAt(now);
        conversation.setUpdatedAt(now);
        conversationMapper.insert(conversation);
        return conversation;
    }

    private CopilotMessageEntity insertMessage(Long conversationId, String role, String content, LocalDateTime now) {
        CopilotMessageEntity message = new CopilotMessageEntity();
        message.setConversationId(conversationId);
        message.setRole(role);
        message.setContent(content);
        message.setCreatedAt(now);
        message.setUpdatedAt(now);
        messageMapper.insert(message);
        return message;
    }

    private String assistantReply(CopilotChatRequest request) {
        AiProviderResponse response = aiProviderRouter.complete(new AiProviderRequest(
                parseProvider(request.getProvider()),
                normalizeOptionalText(request.getModel()),
                copilotPrompt(request),
                Map.of(
                        "temperature", 0.2,
                        "maxTokens", 900
                ),
                COPILOT_TIMEOUT
        ));
        if (response == null || !hasText(response.text())) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "copilot llm response is empty");
        }
        return response.text().strip();
    }

    private String copilotPrompt(CopilotChatRequest request) {
        StringBuilder builder = new StringBuilder();
        builder.append("""
                You are the AetherFlow workflow copilot.
                Help users design workflow nodes, explain run failures, and suggest the next practical action.
                Keep answers concise, concrete, and grounded in AetherFlow workflow concepts.
                Answer in Simplified Chinese when the user writes Chinese; otherwise answer in the user's language.
                Do not invent unavailable node types, credentials, files, or execution results.
                """);
        if (hasText(request.getWorkflowId())) {
            builder.append("\nworkflowId: ").append(request.getWorkflowId().strip());
        }
        if (hasText(request.getProjectId())) {
            builder.append("\nprojectId: ").append(request.getProjectId().strip());
        }
        String contextText = contextText(request.getContext());
        if (hasText(contextText)) {
            builder.append("\ncontext:\n").append(contextText);
        }
        builder.append("\nuser request:\n").append(request.getPrompt().strip());
        return builder.toString();
    }

    private String contextText(Map<String, Object> context) {
        if (context == null || context.isEmpty()) {
            return "";
        }
        Map<String, Object> safeContext = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : context.entrySet()) {
            if (safeContext.size() >= MAX_CONTEXT_ENTRIES) {
                break;
            }
            if (hasText(entry.getKey()) && entry.getValue() != null) {
                safeContext.put(entry.getKey().strip(), entry.getValue());
            }
        }
        return safeContext.entrySet().stream()
                .map(entry -> "- " + entry.getKey() + ": " + truncateContextValue(entry.getValue()))
                .toList()
                .stream()
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
    }

    private String truncateContextValue(Object value) {
        String text = String.valueOf(value).strip();
        if (text.length() <= MAX_CONTEXT_VALUE_LENGTH) {
            return text;
        }
        return text.substring(0, MAX_CONTEXT_VALUE_LENGTH) + "...";
    }

    private AiProviderType parseProvider(String provider) {
        String normalized = normalizeOptionalText(provider);
        if (normalized == null) {
            return null;
        }
        try {
            return AiProviderType.from(normalized, null);
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot provider is invalid");
        }
    }

    private String normalizeOptionalText(String value) {
        return hasText(value) ? value.strip() : null;
    }

    private CopilotConversationSummary toConversationSummary(CopilotConversationEntity entity) {
        return new CopilotConversationSummary(
                conversationId(entity.getId()),
                entity.getTitle(),
                entity.getWorkflowId(),
                entity.getProjectId(),
                defaultNumber(entity.getMessageCount(), 0),
                entity.getLastMessageAt() == null ? null : entity.getLastMessageAt().toString()
        );
    }

    private CopilotMessageResponse toMessageResponse(CopilotMessageEntity entity) {
        return new CopilotMessageResponse(
                messageId(entity.getId()),
                entity.getRole(),
                entity.getContent(),
                formatMessageTime(entity.getCreatedAt())
        );
    }

    private Long parseConversationId(String value) {
        if (!hasText(value)) {
            return null;
        }
        String normalized = value.startsWith("conv-") ? value.substring("conv-".length()) : value;
        try {
            return Long.valueOf(normalized);
        } catch (NumberFormatException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot conversation id invalid");
        }
    }

    private String titleFromPrompt(String prompt) {
        String normalized = prompt.strip();
        return normalized.length() <= 64 ? normalized : normalized.substring(0, 64);
    }

    private String conversationId(Long id) {
        return id == null ? null : "conv-" + id;
    }

    private String messageId(Long id) {
        return id == null ? null : "msg-" + id;
    }

    private String formatMessageTime(LocalDateTime createdAt) {
        return createdAt == null ? null : createdAt.format(MESSAGE_TIME_FORMATTER);
    }

    private Integer defaultNumber(Integer value, int fallback) {
        return Objects.requireNonNullElse(value, fallback);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
