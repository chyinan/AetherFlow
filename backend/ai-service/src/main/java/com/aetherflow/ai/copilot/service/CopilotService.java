package com.aetherflow.ai.copilot.service;

import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatRequest;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotChatResponse;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotConversationSummary;
import com.aetherflow.ai.copilot.dto.CopilotDtos.CopilotMessageResponse;

import java.util.List;

public interface CopilotService {

    CopilotChatResponse chat(CopilotChatRequest request);

    List<CopilotConversationSummary> listConversations(int limit);

    List<CopilotMessageResponse> listMessages(Long conversationId);
}
