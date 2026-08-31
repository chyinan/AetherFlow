package com.aetherflow.ai.provider;

public interface ProviderRoutingPolicyRepository {

    ProviderRoutingPolicy load();

    default ProviderRoutingPolicy load(Long userId) {
        return load();
    }

    void save(ProviderRoutingPolicy policy);

    default void save(Long userId, ProviderRoutingPolicy policy) {
        save(policy);
    }
}
