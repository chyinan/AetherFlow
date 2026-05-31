package com.aetherflow.ai.provider;

public interface ProviderRuntimeConfigClient {

    ProviderRuntimeConfigCatalogResponse catalog();

    ProviderRuntimeConfigCatalogResponse.ProviderRuntimeConfig update(String providerId,
                                                                      ProviderRuntimeConfigRequest request);
}
