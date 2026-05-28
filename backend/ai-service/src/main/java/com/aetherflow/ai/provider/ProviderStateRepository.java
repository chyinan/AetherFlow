package com.aetherflow.ai.provider;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

public interface ProviderStateRepository {

    ProviderCircuitSnapshot readCircuit(AiProviderType provider);

    void saveCircuit(ProviderCircuitSnapshot snapshot, Duration ttl);

    int incrementFailureCount(AiProviderType provider, Duration ttl);

    void resetFailureCount(AiProviderType provider);

    boolean tryAcquireHalfOpenProbe(AiProviderType provider, Duration ttl);

    void releaseHalfOpenProbe(AiProviderType provider);

    void saveHealth(AiProviderHealth health, Duration ttl);

    AiProviderHealth readHealth(AiProviderType provider);

    void saveActiveProvider(AiProviderType provider, Duration ttl);

    Optional<AiProviderType> readActiveProvider();

    List<AiProviderType> readKnownProviders();
}
