package com.aetherflow.file.model;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "MinIO health snapshot.")
public record MinioHealthView(
        @Schema(description = "Health status.", example = "UP")
        String status,
        @Schema(description = "Health detail message.", example = "MinIO bucket reachable")
        String message,
        @Schema(description = "Probe latency in milliseconds.", example = "12")
        Long latencyMs
) {
}
