package com.aetherflow.notify.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.Instant;
import java.util.List;

@Schema(description = "Short-lived token used by browser realtime transports that cannot send Authorization headers.")
public record StreamTokenResponse(
        @Schema(description = "Short-lived stream token.", example = "eyJhbGciOiJIUzI1NiJ9...")
        String token,

        @Schema(description = "Token type.", example = "stream")
        String tokenType,

        @Schema(description = "Authenticated user id.", example = "10001")
        Long userId,

        @Schema(description = "Token expiry timestamp.")
        Instant expiresAt,

        @Schema(description = "Token lifetime in seconds.", example = "60")
        long expiresInSeconds,

        @Schema(description = "Allowed realtime transports.")
        List<String> transports,

        @Schema(description = "Preferred WebSocket query parameter name.", example = "streamToken")
        String queryParam
) {
}
