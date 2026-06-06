package com.aetherflow.auth.settings.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Data;

public final class SettingsDtos {

    private SettingsDtos() {
    }

    @Data
    public static class SettingsProfileUpdateRequest {
        @NotBlank
        private String name;
        @NotBlank
        private String slug;
        @NotBlank
        private String region;
        @NotBlank
        private String environment;
        @Positive
        private Integer defaultTimeoutMin;
        @Positive
        private Integer retentionDays;
    }

    @Data
    public static class MemberCreateRequest {
        @NotBlank
        private String name;
        @Email
        @NotBlank
        private String email;
        @NotBlank
        private String role;
    }

    @Data
    public static class MemberUpdateRequest {
        private String name;
        @Email
        private String email;
        private String role;
        private String status;
    }

    public record SettingsProfileResponse(
            String name,
            String slug,
            String region,
            String environment,
            Integer defaultTimeoutMin,
            Integer retentionDays
    ) {
    }

    public record SettingsMemberResponse(
            String id,
            String name,
            String email,
            String role,
            String status,
            String lastSeen
    ) {
    }

    public record BillingSnapshotResponse(
            String plan,
            Integer aiCredits,
            String monthlyBudget,
            String currentSpend,
            String renewalAt,
            String seats
    ) {
    }

    public record AuditEventResponse(
            String id,
            String time,
            String actor,
            String action,
            String target
    ) {
    }

    @Data
    public static class TelegramIntegrationUpdateRequest {
        private Boolean enabled;
        private String botToken;
        private String chatId;
    }

    public record TelegramIntegrationResponse(
            Boolean enabled,
            Boolean botTokenConfigured,
            String botTokenPreview,
            String chatId,
            String lastTestStatus
    ) {
    }

    public record TelegramIntegrationTestResponse(
            Boolean success,
            String message
    ) {
    }
}
