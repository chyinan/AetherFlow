package com.aetherflow.ai.provider;

import java.time.Duration;
import java.util.List;
import java.util.Map;

public interface ProviderMetricsService {

    void recordCall(AiProviderType provider);

    void recordSuccess(AiProviderType provider, Duration latency);

    void recordFailure(AiProviderType provider, ProviderFailureType failureType, Duration latency);

    void recordRetry(AiProviderType provider);

    void recordFailover(AiProviderType fromProvider, AiProviderType toProvider);

    void recordCircuitOpen(AiProviderType provider);

    Map<AiProviderType, ProviderMetricsSnapshot> snapshot(List<AiProviderType> providers);
}
