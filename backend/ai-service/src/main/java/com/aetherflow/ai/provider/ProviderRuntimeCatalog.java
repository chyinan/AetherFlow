package com.aetherflow.ai.provider;

import java.util.List;

// pattern: Functional Core
public record ProviderRuntimeCatalog(
        List<AiProviderType> providers,
        List<RuntimeModel> models,
        boolean runtimeReachable,
        boolean llmEnabled,
        boolean whisperEnabled,
        boolean whisperRuntimeReady,
        boolean ffmpegAvailable
) {

    public static ProviderRuntimeCatalog empty() {
        return new ProviderRuntimeCatalog(List.of(), List.of(), false, false, false, false, false);
    }

    public static ProviderRuntimeCatalog of(List<AiProviderType> providers, List<RuntimeModel> models) {
        return status(providers, models, true, true, false, false, false);
    }

    public static ProviderRuntimeCatalog status(List<AiProviderType> providers,
                                                List<RuntimeModel> models,
                                                boolean runtimeReachable,
                                                boolean llmEnabled,
                                                boolean whisperEnabled,
                                                boolean whisperRuntimeReady,
                                                boolean ffmpegAvailable) {
        return new ProviderRuntimeCatalog(
                providers == null ? List.of() : List.copyOf(providers),
                models == null ? List.of() : List.copyOf(models),
                runtimeReachable,
                llmEnabled,
                whisperEnabled,
                whisperRuntimeReady,
                ffmpegAvailable
        );
    }

    public record RuntimeModel(AiProviderType provider, String name) {
    }
}
