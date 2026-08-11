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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Consumer;

@Service
public class CopilotServiceImpl implements CopilotService {

    private static final String STATUS_ACTIVE = "active";
    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final DateTimeFormatter MESSAGE_TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private static final Duration COPILOT_TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_CONTEXT_ENTRIES = 12;
    private static final int MAX_CONTEXT_VALUE_LENGTH = 600;
    private static final int MAX_HISTORY_MESSAGES = 20;
    private static final int MAX_HISTORY_VALUE_LENGTH = 2000;

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
    public CopilotChatResponse chat(Long userId, CopilotChatRequest request) {
        requireUserId(userId);
        if (request == null || !hasText(request.getPrompt())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot prompt is required");
        }
        PreparedTurn prepared = transactionTemplate.execute(status -> prepareTurn(userId, request));
        String assistantContent = assistantReply(request, prepared.history());
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

    @Override
    public CopilotChatResponse stream(Long userId, CopilotChatRequest request, Consumer<String> onDelta) {
        requireUserId(userId);
        if (request == null || !hasText(request.getPrompt())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot prompt is required");
        }
        if (onDelta == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot stream consumer is required");
        }
        PreparedTurn prepared = transactionTemplate.execute(status -> prepareTurn(userId, request));
        StringBuilder assistantContent = new StringBuilder();
        aiProviderRouter.stream(providerRequest(request, prepared.history()), response -> {
            if (response != null && hasText(response.text())) {
                String delta = response.text();
                assistantContent.append(delta);
                onDelta.accept(delta);
            }
        });
        if (assistantContent.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "copilot llm response is empty");
        }
        CopilotMessageEntity assistantMessage = transactionTemplate.execute(status ->
                persistAssistantReply(prepared, assistantContent.toString()));
        return new CopilotChatResponse(
                messageId(assistantMessage.getId()),
                conversationId(prepared.conversation().getId()),
                ROLE_ASSISTANT,
                assistantMessage.getContent(),
                formatMessageTime(assistantMessage.getCreatedAt())
        );
    }

    private PreparedTurn prepareTurn(Long userId, CopilotChatRequest request) {
        CopilotConversationEntity conversation = resolveConversation(userId, request);
        List<CopilotMessageEntity> history = loadConversationHistory(conversation.getId());
        LocalDateTime now = LocalDateTime.now();
        insertMessage(conversation.getId(), ROLE_USER, request.getPrompt(), now);
        return new PreparedTurn(conversation, now, history);
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

    private record PreparedTurn(CopilotConversationEntity conversation,
                                LocalDateTime now,
                                List<CopilotMessageEntity> history) {
    }

    @Override
    public List<CopilotConversationSummary> listConversations(Long userId, int limit) {
        requireUserId(userId);
        int safeLimit = limit <= 0 ? 20 : Math.min(limit, 100);
        LambdaQueryWrapper<CopilotConversationEntity> wrapper = new LambdaQueryWrapper<CopilotConversationEntity>()
                .eq(CopilotConversationEntity::getUserId, userId)
                .eq(CopilotConversationEntity::getStatus, STATUS_ACTIVE)
                .orderByDesc(CopilotConversationEntity::getLastMessageAt)
                .orderByDesc(CopilotConversationEntity::getId)
                .last("limit " + safeLimit);
        return conversationMapper.selectList(wrapper).stream()
                .map(this::toConversationSummary)
                .toList();
    }

    @Override
    public List<CopilotMessageResponse> listMessages(Long userId, Long conversationId) {
        requireUserId(userId);
        requireOwnedConversation(userId, conversationId);
        LambdaQueryWrapper<CopilotMessageEntity> wrapper = new LambdaQueryWrapper<CopilotMessageEntity>()
                .eq(CopilotMessageEntity::getConversationId, conversationId)
                .orderByAsc(CopilotMessageEntity::getId);
        return messageMapper.selectList(wrapper).stream()
                .map(this::toMessageResponse)
                .toList();
    }

    private CopilotConversationEntity resolveConversation(Long userId, CopilotChatRequest request) {
        Long conversationId = parseConversationId(request.getConversationId());
        if (conversationId != null) {
            LambdaQueryWrapper<CopilotConversationEntity> wrapper = new LambdaQueryWrapper<CopilotConversationEntity>()
                    .eq(CopilotConversationEntity::getId, conversationId)
                    .eq(CopilotConversationEntity::getUserId, userId)
                    .eq(CopilotConversationEntity::getStatus, STATUS_ACTIVE);
            CopilotConversationEntity existing = conversationMapper.selectOne(wrapper);
            if (existing == null) {
                throw new BusinessException(ResultCode.NOT_FOUND, "copilot conversation not found");
            }
            validateConversationScope(existing, request);
            return existing;
        }
        return createConversation(userId, request);
    }

    private CopilotConversationEntity createConversation(Long userId, CopilotChatRequest request) {
        LocalDateTime now = LocalDateTime.now();
        CopilotConversationEntity conversation = new CopilotConversationEntity();
        conversation.setUserId(userId);
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

    private void requireOwnedConversation(Long userId, Long conversationId) {
        if (conversationId == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot conversation id is required");
        }
        LambdaQueryWrapper<CopilotConversationEntity> wrapper = new LambdaQueryWrapper<CopilotConversationEntity>()
                .eq(CopilotConversationEntity::getId, conversationId)
                .eq(CopilotConversationEntity::getUserId, userId)
                .eq(CopilotConversationEntity::getStatus, STATUS_ACTIVE);
        if (conversationMapper.selectOne(wrapper) == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "copilot conversation not found");
        }
    }

    private void requireUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        }
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

    private List<CopilotMessageEntity> loadConversationHistory(Long conversationId) {
        LambdaQueryWrapper<CopilotMessageEntity> wrapper = new LambdaQueryWrapper<CopilotMessageEntity>()
                .eq(CopilotMessageEntity::getConversationId, conversationId)
                .orderByAsc(CopilotMessageEntity::getId);
        List<CopilotMessageEntity> messages = messageMapper.selectList(wrapper);
        if (messages == null || messages.isEmpty()) {
            return List.of();
        }
        List<CopilotMessageEntity> sorted = new ArrayList<>(messages);
        sorted.sort(Comparator.comparing(CopilotMessageEntity::getId,
                Comparator.nullsLast(Comparator.naturalOrder())));
        int start = Math.max(0, sorted.size() - MAX_HISTORY_MESSAGES);
        return List.copyOf(sorted.subList(start, sorted.size()));
    }

    private void validateConversationScope(CopilotConversationEntity conversation, CopilotChatRequest request) {
        if (hasText(request.getWorkflowId())
                && !Objects.equals(request.getWorkflowId().strip(), normalizeOptionalText(conversation.getWorkflowId()))) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot conversation does not belong to workflow");
        }
        if (hasText(request.getProjectId())
                && !Objects.equals(request.getProjectId().strip(), normalizeOptionalText(conversation.getProjectId()))) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot conversation does not belong to project");
        }
    }

    private String assistantReply(CopilotChatRequest request, List<CopilotMessageEntity> history) {
        AiProviderResponse response = aiProviderRouter.complete(providerRequest(request, history));
        if (response == null || !hasText(response.text())) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "copilot llm response is empty");
        }
        return response.text().strip();
    }

    private AiProviderRequest providerRequest(CopilotChatRequest request, List<CopilotMessageEntity> history) {
        return new AiProviderRequest(
                parseProvider(request.getProvider()),
                normalizeOptionalText(request.getModel()),
                copilotPrompt(request, history),
                Map.of(
                        "temperature", 0.2,
                        "maxTokens", 900
                ),
                COPILOT_TIMEOUT
        );
    }

    private String copilotPrompt(CopilotChatRequest request, List<CopilotMessageEntity> history) {
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
        if (history != null && !history.isEmpty()) {
            builder.append("\nconversation history:\n");
            for (CopilotMessageEntity message : history) {
                builder.append("- ")
                        .append(hasText(message.getRole()) ? message.getRole().strip() : "message")
                        .append(": ")
                        .append(truncateHistoryValue(message.getContent()))
                        .append('\n');
            }
        }
        builder.append("\nuser request:\n").append(request.getPrompt().strip());
        return builder.toString();
    }

    private String truncateHistoryValue(String value) {
        String text = value == null ? "" : value.strip();
        if (text.length() <= MAX_HISTORY_VALUE_LENGTH) {
            return text;
        }
        return text.substring(0, MAX_HISTORY_VALUE_LENGTH) + "...";
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
