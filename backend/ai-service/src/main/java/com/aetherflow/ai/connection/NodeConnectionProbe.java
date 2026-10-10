package com.aetherflow.ai.connection;

import java.util.List;

public record NodeConnectionProbe(String status, String message, String detectedFrom, Models models,
                                  List<String> capabilities, List<String> warnings,
                                  List<String> unavailableCatalogs) {
    public record Models(List<String> checkpoints, List<String> vaes, List<String> loras,
                         List<String> samplers, List<String> schedulers, List<String> upscalers) {
        public static Models empty() {
            return new Models(List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
    }

    public static NodeConnectionProbe unavailable(String status, String message) {
        return new NodeConnectionProbe(status, message, "backend", Models.empty(), List.of(), List.of(), List.of());
    }
}
