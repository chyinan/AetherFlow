package com.aetherflow.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Logout request used to revoke access token and refresh session.")
public class AuthLogoutRequest {

    @NotBlank
    @Schema(description = "Access token to blacklist.", example = "eyJhbGciOiJIUzI1NiJ9.access")
    private String accessToken;

    @Schema(description = "Refresh token for non-browser clients. Browsers use the HttpOnly refresh cookie.", example = "eyJhbGciOiJIUzI1NiJ9.refresh")
    private String refreshToken;
}
