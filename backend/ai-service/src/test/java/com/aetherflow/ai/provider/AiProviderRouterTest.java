package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AiProviderRouterTest {

    @Test
    void failsOverToNextPriorityProviderWhenPrimaryFails() {
        ProviderRoutingPolicy policy = policy(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA), 0, 5);
        RouterFixture fixture = fixture(policy,
                new FakeProvider(AiProviderType.OPENAI, new IllegalStateException("timeout")),
                new FakeProvider(AiProviderType.OLLAMA, "ollama-result"));

        AiProviderResponse response = fixture.router.complete(request(null));

        assertThat(response.provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(response.text()).isEqualTo("ollama-result");
        assertThat(fixture.provider(AiProviderType.OPENAI).calls).isEqualTo(1);
        assertThat(fixture.provider(AiProviderType.OLLAMA).calls).isEqualTo(1);
        assertThat(fixture.stateRepository.readActiveProvider()).contains(AiProviderType.OLLAMA);
        assertThat(fixture.logs.eventTypes()).contains("FAILOVER", "ERROR", "SUCCESS");
    }

    @Test
    void skipsOpenCircuitProviderWithoutCallingIt() {
        ProviderRoutingPolicy policy = policy(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA), 0, 5);
        RouterFixture fixture = fixture(policy,
                new FakeProvider(AiProviderType.OPENAI, "openai-result"),
                new FakeProvider(AiProviderType.OLLAMA, "ollama-result"));
        fixture.stateRepository.saveCircuit(new ProviderCircuitSnapshot(
                AiProviderType.OPENAI,
                ProviderCircuitState.OPEN,
                5,
                Instant.now().plusSeconds(60),
                Instant.now(),
                "timeout"
        ), Duration.ofMinutes(2));

        AiProviderResponse response = fixture.router.complete(request(null));

        assertThat(response.provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(fixture.provider(AiProviderType.OPENAI).calls).isZero();
        assertThat(fixture.provider(AiProviderType.OLLAMA).calls).isEqualTo(1);
        assertThat(fixture.logs.eventTypes()).contains("CIRCUIT_SKIP", "FAILOVER");
    }

    @Test
    void retriesProviderBeforeFailoverWhenFailureIsRetryable() {
        ProviderRoutingPolicy policy = policy(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA), 2, 5);
        RouterFixture fixture = fixture(policy,
                new FakeProvider(AiProviderType.OPENAI,
                        new IllegalStateException("timeout"),
                        new IllegalStateException("timeout"),
                        "openai-result"),
                new FakeProvider(AiProviderType.OLLAMA, "ollama-result"));

        AiProviderResponse response = fixture.router.complete(request(null));

        assertThat(response.provider()).isEqualTo(AiProviderType.OPENAI);
        assertThat(response.text()).isEqualTo("openai-result");
        assertThat(fixture.provider(AiProviderType.OPENAI).calls).isEqualTo(3);
        assertThat(fixture.provider(AiProviderType.OLLAMA).calls).isZero();
        assertThat(fixture.metrics.retryCount(AiProviderType.OPENAI)).isEqualTo(2);
    }

    @Test
    void opensCircuitAndFailsOverWithoutMoreRetriesWhenFailureThresholdIsReached() {
        ProviderRoutingPolicy policy = policy(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA), 2, 1);
        RouterFixture fixture = fixture(policy,
                new FakeProvider(AiProviderType.OPENAI, new IllegalStateException("timeout")),
                new FakeProvider(AiProviderType.OLLAMA, "ollama-result"));

        AiProviderResponse response = fixture.router.complete(request(null));

        assertThat(response.provider()).isEqualTo(AiProviderType.OLLAMA);
        assertThat(fixture.provider(AiProviderType.OPENAI).calls).isEqualTo(1);
        assertThat(fixture.stateRepository.readCircuit(AiProviderType.OPENAI).state()).isEqualTo(ProviderCircuitState.OPEN);
        assertThat(fixture.metrics.circuitOpenCount(AiProviderType.OPENAI)).isEqualTo(1);
    }

    @Test
    void explicitProviderIsUsedAsPrimaryButCanStillFailOver() {
        ProviderRoutingPolicy policy = policy(List.of(AiProviderType.OPENAI, AiProviderType.OLLAMA), 0, 5);
        RouterFixture fixture = fixture(policy,
                new FakeProvider(AiProviderType.OPENAI, "openai-result"),
                new FakeProvider(AiProviderType.OLLAMA, new IllegalStateException("timeout")));

        AiProviderResponse response = fixture.router.complete(request(AiProviderType.OLLAMA));

        assertThat(response.provider()).isEqualTo(AiProviderType.OPENAI);
        assertThat(fixture.provider(AiProviderType.OLLAMA).calls).isEqualTo(1);
        assertThat(fixture.provider(AiProviderType.OPENAI).calls).isEqualTo(1);
    }

    private ProviderRoutingPolicy policy(List<AiProviderType> providers, int maxRetries, int threshold) {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setProviders(providers);
        policy.setEnableFailover(true);
        policy.setAutoRecoverPrimary(true);
        policy.setMaxRetries(maxRetries);
        policy.setCircuitFailureThreshold(threshold);
        policy.setRetryInitialBackoff(Duration.ZERO);
        policy.setRetryMaxBackoff(Duration.ZERO);
        policy.setCircuitOpenDuration(Duration.ofSeconds(60));
        policy.setHealthCheckInterval(Duration.ofSeconds(30));
        return policy;
    }

    private AiProviderRequest request(AiProviderType provider) {
        return new AiProviderRequest(provider, "gpt-4o-mini", "summarize", Map.of("temperature", 0.2), Duration.ofSeconds(10));
    }

    private RouterFixture fixture(ProviderRoutingPolicy policy, FakeProvider... fakeProviders) {
        AiTaskProperties properties = new AiTaskProperties();
        properties.setProviderCircuitFailureThreshold(policy.getCircuitFailureThreshold());
        properties.setProviderCircuitOpenDuration(policy.getCircuitOpenDuration());
        properties.setProviderHealthCheckInterval(policy.getHealthCheckInterval());
        InMemoryPolicyRepository policyRepository = new InMemoryPolicyRepository(policy);
        ProviderRoutingPolicyService policyService = new ProviderRoutingPolicyService(policyRepository, properties);
        InMemoryStateRepository stateRepository = new InMemoryStateRepository();
        ProviderCircuitBreaker circuitBreaker = new ProviderCircuitBreaker(stateRepository, properties);
        InMemoryMetricsService metrics = new InMemoryMetricsService();
        InMemoryLogService logs = new InMemoryLogService();
        List<AiProvider> providers = new ArrayList<>();
        providers.addAll(List.of(fakeProviders));
        AiProviderRouter router = new AiProviderRouter(providers, policyService, circuitBreaker, stateRepository, metrics, logs, new SentinelAiGuard());
        return new RouterFixture(router, List.of(fakeProviders), stateRepository, metrics, logs);
    }

    private record RouterFixture(
            AiProviderRouter router,
            List<FakeProvider> providers,
            InMemoryStateRepository stateRepository,
            InMemoryMetricsService metrics,
            InMemoryLogService logs
    ) {
        FakeProvider provider(AiProviderType type) {
            return providers.stream().filter(provider -> provider.type() == type).findFirst().orElseThrow();
        }
    }

    private static final class FakeProvider implements AiProvider {
        private final AiProviderType type;
        private final Queue<Object> outcomes = new ArrayDeque<>();
        private int calls;

        private FakeProvider(AiProviderType type, Object... outcomes) {
            this.type = type;
            this.outcomes.addAll(List.of(outcomes));
        }

        @Override
        public AiProviderType type() {
            return type;
        }

        @Override
        public AiProviderResponse complete(AiProviderRequest request) {
            calls++;
            Object outcome = outcomes.isEmpty() ? "ok" : outcomes.remove();
            if (outcome instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            return new AiProviderResponse(type, request.model(), String.valueOf(outcome), Map.of("finishReason", "stop"));
        }
    }

    private static final class InMemoryPolicyRepository implements ProviderRoutingPolicyRepository {
        private ProviderRoutingPolicy policy;

        private InMemoryPolicyRepository(ProviderRoutingPolicy policy) {
            this.policy = policy;
        }

        @Override
        public ProviderRoutingPolicy load() {
            return policy;
        }

        @Override
        public void save(ProviderRoutingPolicy policy) {
            this.policy = policy;
        }
    }

    private static final class InMemoryStateRepository implements ProviderStateRepository {
        private final Map<AiProviderType, ProviderCircuitSnapshot> circuits = new EnumMap<>(AiProviderType.class);
        private final Map<AiProviderType, Integer> failures = new EnumMap<>(AiProviderType.class);
        private final Map<AiProviderType, AiProviderHealth> health = new EnumMap<>(AiProviderType.class);
        private final Set<AiProviderType> halfOpenLocks = new HashSet<>();
        private AiProviderType activeProvider;

        @Override
        public ProviderCircuitSnapshot readCircuit(AiProviderType provider) {
            return circuits.getOrDefault(provider, ProviderCircuitSnapshot.closed(provider));
        }

        @Override
        public void saveCircuit(ProviderCircuitSnapshot snapshot, Duration ttl) {
            circuits.put(snapshot.provider(), snapshot);
        }

        @Override
        public int incrementFailureCount(AiProviderType provider, Duration ttl) {
            int count = failures.getOrDefault(provider, 0) + 1;
            failures.put(provider, count);
            return count;
        }

        @Override
        public void resetFailureCount(AiProviderType provider) {
            failures.remove(provider);
        }

        @Override
        public boolean tryAcquireHalfOpenProbe(AiProviderType provider, Duration ttl) {
            return halfOpenLocks.add(provider);
        }

        @Override
        public void releaseHalfOpenProbe(AiProviderType provider) {
            halfOpenLocks.remove(provider);
        }

        @Override
        public void saveHealth(AiProviderHealth health, Duration ttl) {
            this.health.put(health.provider(), health);
        }

        @Override
        public AiProviderHealth readHealth(AiProviderType provider) {
            return health.get(provider);
        }

        @Override
        public void saveActiveProvider(AiProviderType provider, Duration ttl) {
            activeProvider = provider;
        }

        @Override
        public Optional<AiProviderType> readActiveProvider() {
            return Optional.ofNullable(activeProvider);
        }

        @Override
        public List<AiProviderType> readKnownProviders() {
            return List.of(AiProviderType.values());
        }
    }

    private static final class InMemoryMetricsService implements ProviderMetricsService {
        private final Map<AiProviderType, Counters> counters = new EnumMap<>(AiProviderType.class);

        @Override
        public void recordCall(AiProviderType provider) {
            counters(provider).calls++;
        }

        @Override
        public void recordSuccess(AiProviderType provider, Duration latency) {
            counters(provider).successes++;
        }

        @Override
        public void recordFailure(AiProviderType provider, ProviderFailureType failureType, Duration latency) {
            counters(provider).failures++;
        }

        @Override
        public void recordRetry(AiProviderType provider) {
            counters(provider).retries++;
        }

        @Override
        public void recordFailover(AiProviderType fromProvider, AiProviderType toProvider) {
            counters(fromProvider).failovers++;
        }

        @Override
        public void recordCircuitOpen(AiProviderType provider) {
            counters(provider).circuitOpens++;
        }

        @Override
        public Map<AiProviderType, ProviderMetricsSnapshot> snapshot(List<AiProviderType> providers) {
            Map<AiProviderType, ProviderMetricsSnapshot> result = new EnumMap<>(AiProviderType.class);
            for (AiProviderType provider : providers) {
                Counters counter = counters(provider);
                result.put(provider, new ProviderMetricsSnapshot(provider, counter.calls, counter.successes, counter.failures,
                        counter.retries, counter.failovers, counter.circuitOpens, 0, 0, 0, Instant.now()));
            }
            return result;
        }

        long retryCount(AiProviderType provider) {
            return counters(provider).retries;
        }

        long circuitOpenCount(AiProviderType provider) {
            return counters(provider).circuitOpens;
        }

        private Counters counters(AiProviderType provider) {
            return counters.computeIfAbsent(provider, ignored -> new Counters());
        }

        private static final class Counters {
            private long calls;
            private long successes;
            private long failures;
            private long retries;
            private long failovers;
            private long circuitOpens;
        }
    }

    private static final class InMemoryLogService implements AIInferenceLogService {
        private final List<AIInferenceLog> logs = new ArrayList<>();

        @Override
        public void record(AIInferenceLog log) {
            logs.add(log);
        }

        @Override
        public List<AIInferenceLog> recent(int limit) {
            return logs.stream().limit(limit).toList();
        }

        List<String> eventTypes() {
            return logs.stream().map(AIInferenceLog::eventType).toList();
        }
    }
}
