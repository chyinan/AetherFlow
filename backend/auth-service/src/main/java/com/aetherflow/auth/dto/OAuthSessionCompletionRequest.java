package com.aetherflow.auth.dto;

// pattern: Functional Core

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class OAuthSessionCompletionRequest {

    @NotBlank
    @Pattern(regexp = "github|google")
    private String provider;

    @NotBlank
    private String state;

    @NotBlank
    private String accessToken;
}
