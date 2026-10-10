package com.aetherflow.ai.copilot.dto;

// pattern: Imperative Shell

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.Map;
import java.util.List;

public final class CopilotDtos {

    private CopilotDtos() {
    }

    @Data
    public static class CopilotChatRequest {
        private String conversationId;
        @NotBlank
        private String prompt;
        /** Display-safe user text. The prompt field may contain server-side context for the model. */
        private String displayPrompt;
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
            String createdAt,
            CopilotWorkflowPlan plan,
            Long planBaseRevision,
            Integer planBaseVersion,
            String planBaseFingerprint
    ) {
        public CopilotChatResponse(String id, String conversationId, String role, String content, String createdAt) {
            this(id, conversationId, role, content, createdAt, null, null, null, null);
        }
    }

    public record CopilotCanvasEditResponse(
            CopilotChatResponse message,
            com.aetherflow.ai.copilot.service.CopilotCanvasEdits.Edit edit
    ) { }

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
            String createdAt,
            CopilotWorkflowPlan plan,
            Long planBaseRevision,
            Integer planBaseVersion,
            String planBaseFingerprint
    ) {
        public CopilotMessageResponse(String id, String role, String content, String createdAt) {
            this(id, role, content, createdAt, null, null, null, null);
        }
    }

    public enum CopilotWorkflowPlanStatus {
        READY,
        NEEDS_CLARIFICATION,
        UNSUPPORTED
    }

    public enum CopilotWorkflowInputKind {
        MEDIA_FILE,
        PUBLIC_URL,
        UNKNOWN
    }

    public enum CopilotWorkflowRecipe {
        MEDIA_SUMMARY,
        URL_SUMMARY
    }

    /**
     * The planner contract is deliberately smaller than the workflow node catalog. The model
     * can choose only a supported recipe and provide bounded user-facing requirements; the
     * canvas compiler still creates nodes from trusted templates.
     */
    public record CopilotWorkflowRequirements(
            String goal,
            CopilotWorkflowInputKind inputKind,
            String inputDescription,
            String outputFormat,
            String language,
            String audience,
            String instruction,
            List<String> constraints
    ) {
    }

    public record CopilotWorkflowPlan(
            CopilotWorkflowPlanStatus status,
            CopilotWorkflowRequirements requirements,
            CopilotWorkflowRecipe recipe,
            List<String> steps,
            String explanation,
            String clarifyingQuestion,
            List<String> assumptions
    ) {
    }

    /** Internal persistence envelope. The client-provided edit revision is an optimistic UI guard only. */
    public record CopilotWorkflowPlanPersistence(
            CopilotWorkflowPlan plan,
            Long baseEditRevision,
            Integer baseBackendVersion,
            String baseGraphFingerprint
    ) {
    }
}
