package com.aetherflow.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

@Data
@Schema(description = "Refresh token request.")
public class AuthRefreshRequest {

    @Schema(description = "Refresh token for non-browser clients. Browsers use the HttpOnly refresh cookie.", example = "eyJhbGciOiJIUzI1NiJ9.refresh")
    private String refreshToken;
}
