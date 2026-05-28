package com.aetherflow.auth.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "Refresh token request.")
public class AuthRefreshRequest {

    @NotBlank
    @Schema(description = "Refresh token returned by login or register.", example = "eyJhbGciOiJIUzI1NiJ9.refresh")
    private String refreshToken;
}
