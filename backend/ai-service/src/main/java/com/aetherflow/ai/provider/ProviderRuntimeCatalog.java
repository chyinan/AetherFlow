package com.aetherflow.ai.provider;

import java.util.List;

public record ProviderRuntimeCatalog(
        List<AiProviderType> providers,
        List<RuntimeModel> models
) {

    public static ProviderRuntimeCatalog empty() {
        return new ProviderRuntimeCatalog(List.of(), List.of());
    }

    public static ProviderRuntimeCatalog of(List<AiProviderType> providers, List<RuntimeModel> models) {
        return new ProviderRuntimeCatalog(
                providers == null ? List.of() : List.copyOf(providers),
                models == null ? List.of() : List.copyOf(models)
        );
    }

    public record RuntimeModel(AiProviderType provider, String name) {
    }
}
