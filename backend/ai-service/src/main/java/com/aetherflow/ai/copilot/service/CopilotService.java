package com.aetherflow.ai.copilot.service;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;

import java.util.List;
import java.util.function.Consumer;

public interface CopilotService {

    CopilotChatResponse chat(Long userId, CopilotChatRequest request);

    CopilotChatResponse stream(Long userId, CopilotChatRequest request, Consumer<String> onDelta);

    List<CopilotConversationSummary> listConversations(Long userId, int limit);

    List<CopilotMessageResponse> listMessages(Long userId, Long conversationId);
}
