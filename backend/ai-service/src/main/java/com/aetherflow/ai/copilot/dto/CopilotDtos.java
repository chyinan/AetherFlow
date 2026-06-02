package com.aetherflow.ai.copilot.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;

public final class CopilotDtos {

    private CopilotDtos() {
    }

    @Data
    public static class CopilotChatRequest {
        private String conversationId;
        @NotBlank
        private String prompt;
        private String workflowId;
        private String projectId;
        private String provider;
        private String model;
        private Map<String, Object> context;
    }

    public record CopilotChatResponse(
            String id,
            String conversationId,
            String role,
            String content,
            String createdAt
    ) {
    }

    public record CopilotConversationSummary(
            String id,
            String title,
            String workflowId,
            String projectId,
            Integer messageCount,
            String updatedAt
    ) {
    }

    public record CopilotMessageResponse(
            String id,
            String role,
            String content,
            String createdAt
    ) {
    }
}
