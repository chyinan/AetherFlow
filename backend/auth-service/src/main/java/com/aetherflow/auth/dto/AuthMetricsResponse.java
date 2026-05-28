package com.aetherflow.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Auth service session and security metrics.")
public class AuthMetricsResponse {

    @Schema(description = "Number of online users with active auth:token:{userId} sessions.", example = "2")
    private long onlineUserCount;

    @Schema(description = "Number of active access tokens tracked in Redis.", example = "2")
    private long tokenCount;

    @Schema(description = "Total password-login failure count currently retained in Redis.", example = "5")
    private long loginFailureCount;
}
