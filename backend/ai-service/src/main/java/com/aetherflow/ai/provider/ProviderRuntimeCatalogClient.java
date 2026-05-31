package com.aetherflow.ai.provider;

public interface ProviderRuntimeCatalogClient {

    ProviderRuntimeCatalog catalog();

    static ProviderRuntimeCatalogClient empty() {
        return ProviderRuntimeCatalog::empty;
    }
}
