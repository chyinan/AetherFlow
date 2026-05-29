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
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class CopilotServiceImpl implements CopilotService {

    private static final String STATUS_ACTIVE = "active";
    private static final String ROLE_USER = "user";
    private static final String ROLE_ASSISTANT = "assistant";
    private static final DateTimeFormatter MESSAGE_TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    private final CopilotConversationMapper conversationMapper;
    private final CopilotMessageMapper messageMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public CopilotChatResponse chat(CopilotChatRequest request) {
        if (request == null || !hasText(request.getPrompt())) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "copilot prompt is required");
        }
        CopilotConversationEntity conversation = resolveConversation(request);
        LocalDateTime now = LocalDateTime.now();

        insertMessage(conversation.getId(), ROLE_USER, request.getPrompt(), now);
        CopilotMessageEntity assistantMessage = insertMessage(conversation.getId(), ROLE_ASSISTANT,
                assistantReply(request.getPrompt()), now);

        conversation.setMessageCount(defaultNumber(conversation.getMessageCount(), 0) + 2);
        conversation.setLastMessageAt(now);
        conversation.setUpdatedAt(now);
        conversationMapper.updateById(conversation);

        return new CopilotChatResponse(
                messageId(assistantMessage.getId()),
                conversationId(conversation.getId()),
                ROLE_ASSISTANT,
                assistantMessage.getContent(),
                formatMessageTime(assistantMessage.getCreatedAt())
        );
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

    private String assistantReply(String prompt) {
        String lowered = prompt.toLowerCase(Locale.ROOT);
        if (lowered.contains("error")) {
            return "The likely failure point is the active Whisper node. Check input media format, runtime queue capacity, and transcript output mapping before rerunning.";
        }
        if (lowered.contains("node")) {
            return "A solid next node is Summary after Translate. Keep the summary node output as summary.md and actions.json so Files can show final artifacts.";
        }
        return "I can turn that into a workflow draft by adding media input, FFmpeg, Whisper, Translate, and Summary nodes with typed outputs.";
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
