package com.aetherflow.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Auth token pair response with access token and refresh token.")
public class AuthTokenResponse {

    @Schema(description = "Authenticated user id.", example = "7")
    private Long userId;

    @Schema(description = "Authenticated username.", example = "alice")
    private String username;

    @Schema(description = "Granted RBAC roles.", example = "[\"USER\"]")
    private List<String> roles;

    @Schema(description = "Token type used in Authorization header.", example = "Bearer")
    private String tokenType;

    @Schema(description = "Short-lived JWT access token.", example = "eyJhbGciOiJIUzI1NiJ9.access")
    private String accessToken;

    @Schema(description = "Long-lived refresh token used only by auth-service.", example = "eyJhbGciOiJIUzI1NiJ9.refresh")
    private String refreshToken;

    @Schema(description = "Access token lifetime in seconds.", example = "7200")
    private long expiresIn;

    @Schema(description = "Refresh token lifetime in seconds.", example = "604800")
    private long refreshExpiresIn;
}
