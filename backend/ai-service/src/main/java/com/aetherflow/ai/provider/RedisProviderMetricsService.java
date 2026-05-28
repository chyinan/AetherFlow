package com.aetherflow.ai.provider;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RedisProviderMetricsService implements ProviderMetricsService {

    private final StringRedisTemplate redisTemplate;

    @Override
    public void recordCall(AiProviderType provider) {
        increment(provider, "calls");
    }

    @Override
    public void recordSuccess(AiProviderType provider, Duration latency) {
        increment(provider, "successes");
        recordLatency(provider, latency);
    }

    @Override
    public void recordFailure(AiProviderType provider, ProviderFailureType failureType, Duration latency) {
        increment(provider, "failures");
        increment(provider, "failure:" + failureType.name());
        recordLatency(provider, latency);
    }

    @Override
    public void recordRetry(AiProviderType provider) {
        increment(provider, "retries");
    }

    @Override
    public void recordFailover(AiProviderType fromProvider, AiProviderType toProvider) {
        increment(fromProvider, "failovers");
        increment(toProvider, "failover_target");
    }

    @Override
    public void recordCircuitOpen(AiProviderType provider) {
        increment(provider, "circuit_opens");
    }

    @Override
    public Map<AiProviderType, ProviderMetricsSnapshot> snapshot(List<AiProviderType> providers) {
        Map<AiProviderType, ProviderMetricsSnapshot> snapshots = new LinkedHashMap<>();
        for (AiProviderType provider : providers) {
            long calls = get(provider, "calls");
            long latencyCount = get(provider, "latency_count");
            long totalLatency = get(provider, "latency_total");
            long averageLatency = latencyCount == 0 ? 0 : totalLatency / latencyCount;
            snapshots.put(provider, new ProviderMetricsSnapshot(
                    provider,
                    calls,
                    get(provider, "successes"),
                    get(provider, "failures"),
                    get(provider, "retries"),
                    get(provider, "failovers"),
                    get(provider, "circuit_opens"),
                    get(provider, "latency_last"),
                    averageLatency,
                    get(provider, "latency_max"),
                    Instant.now()
            ));
        }
        return snapshots;
    }

    private void recordLatency(AiProviderType provider, Duration latency) {
        if (latency == null) {
            return;
        }
        long latencyMillis = Math.max(0, latency.toMillis());
        increment(provider, "latency_count");
        add(provider, "latency_total", latencyMillis);
        set(provider, "latency_last", latencyMillis);
        long currentMax = get(provider, "latency_max");
        if (latencyMillis > currentMax) {
            set(provider, "latency_max", latencyMillis);
        }
    }

    private void increment(AiProviderType provider, String metric) {
        add(provider, metric, 1L);
    }

    private void add(AiProviderType provider, String metric, long value) {
        try {
            redisTemplate.opsForValue().increment(ProviderRedisKeys.metric(provider, metric), value);
        } catch (RuntimeException exception) {
            log.warn("Failed to increment provider metric provider={}, metric={}", provider, metric, exception);
        }
    }

    private void set(AiProviderType provider, String metric, long value) {
        try {
            redisTemplate.opsForValue().set(ProviderRedisKeys.metric(provider, metric), Long.toString(value));
        } catch (RuntimeException exception) {
            log.warn("Failed to set provider metric provider={}, metric={}", provider, metric, exception);
        }
    }

    private long get(AiProviderType provider, String metric) {
        try {
            String value = redisTemplate.opsForValue().get(ProviderRedisKeys.metric(provider, metric));
            return value == null || value.isBlank() ? 0L : Long.parseLong(value);
        } catch (RuntimeException exception) {
            log.warn("Failed to read provider metric provider={}, metric={}", provider, metric, exception);
            return 0L;
        }
    }
}
