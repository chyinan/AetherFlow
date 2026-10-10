package com.aetherflow.ai.connection;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record NodeConnectionRequest(
        @NotBlank @Size(max = 80) String name,
        @NotBlank String provider,
        @NotBlank @Size(max = 2048) String baseUrl) {
}
