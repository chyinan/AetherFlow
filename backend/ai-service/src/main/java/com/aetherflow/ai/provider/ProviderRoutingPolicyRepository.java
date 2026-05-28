package com.aetherflow.ai.provider;

public interface ProviderRoutingPolicyRepository {

    ProviderRoutingPolicy load();

    void save(ProviderRoutingPolicy policy);
}
