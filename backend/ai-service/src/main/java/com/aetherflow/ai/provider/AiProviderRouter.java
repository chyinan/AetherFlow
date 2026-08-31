package com.aetherflow.ai.provider;

import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Component
public class AiProviderRouter {

    private static final String ROUTER_RESOURCE = "ai-provider-router";

    private final Map<AiProviderType, AiProvider> providers;
    private final ProviderRoutingPolicyService policyService;
    private final ProviderCircuitBreaker circuitBreaker;
    private final ProviderStateRepository stateRepository;
    private final ProviderMetricsService metricsService;
    private final AIInferenceLogService logService;
    private final SentinelAiGuard sentinelAiGuard;
    private final ProviderPricingSnapshotService pricingSnapshotService;

    public AiProviderRouter(List<AiProvider> providers,
                            ProviderRoutingPolicyService policyService,
                            ProviderCircuitBreaker circuitBreaker,
                            ProviderStateRepository stateRepository,
                            ProviderMetricsService metricsService,
                            AIInferenceLogService logService,
                            SentinelAiGuard sentinelAiGuard,
                            ProviderPricingSnapshotService pricingSnapshotService) {
        this.providers = new EnumMap<>(AiProviderType.class);
        for (AiProvider provider : providers) {
            this.providers.put(provider.type(), provider);
        }
        this.policyService = policyService;
        this.circuitBreaker = circuitBreaker;
        this.stateRepository = stateRepository;
        this.metricsService = metricsService;
        this.logService = logService;
        this.sentinelAiGuard = sentinelAiGuard;
        this.pricingSnapshotService = pricingSnapshotService;
    }

    public AiProviderResponse complete(AiProviderRequest request) {
        return generate(request);
    }

    public AiProviderResponse generate(AiProviderRequest request) {
        return sentinelAiGuard.execute(ROUTER_RESOURCE, () -> doGenerate(request));
    }

    public void stream(AiProviderRequest request, Consumer<AiProviderResponse> consumer) {
        if (consumer == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai provider stream consumer is required");
        }
        sentinelAiGuard.run(ROUTER_RESOURCE, () -> doStream(request, consumer));
    }

    private void doStream(AiProviderRequest request, Consumer<AiProviderResponse> consumer) {
        if (request == null || request.prompt() == null || request.prompt().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai provider request prompt is required");
        }
        ProviderRoutingPolicy policy = policyService.currentPolicy();
        List<AiProviderType> candidates = policy.orderedCandidates(request.provider());
        if (!policy.isEnableFailover() && !candidates.isEmpty()) {
            candidates = List.of(candidates.get(0));
        }
        if (candidates.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "no ai provider configured");
        }
        RuntimeException lastException = null;
        for (AiProviderType providerType : candidates) {
            AiProvider provider = providers.get(providerType);
            if (provider == null) {
                continue;
            }
            ProviderCallPermission permission = circuitBreaker.beforeCall(providerType, policy);
            if (!permission.allowed()) {
                continue;
            }
            Instant startedAt = Instant.now();
            AtomicBoolean streamStarted = new AtomicBoolean(false);
            try {
                metricsService.recordCall(providerType);
                AiProviderRequest routedRequest = request.withProvider(providerType)
                        .withTimeout(policy.effectiveRequestTimeout(request.timeout()));
                provider.stream(routedRequest, response -> {
                    if (response != null && response.text() != null && !response.text().isBlank()) {
                        streamStarted.set(true);
                    }
                    consumer.accept(response);
                });
                Duration latency = Duration.between(startedAt, Instant.now());
                circuitBreaker.onSuccess(providerType, permission.halfOpenProbe(), policy);
                metricsService.recordSuccess(providerType, latency);
                recordEvent("SUCCESS", providerType, null, null, request,
                        "provider stream succeeded", latency.toMillis(), 1, null, Map.of("stream", true));
                return;
            } catch (RuntimeException exception) {
                lastException = exception;
                ProviderFailureType failureType = ProviderFailureClassifier.classify(exception);
                circuitBreaker.onFailure(providerType, failureType, exception.getMessage(), permission.halfOpenProbe(), policy);
                metricsService.recordFailure(providerType, failureType, Duration.between(startedAt, Instant.now()));
                if (streamStarted.get()) {
                    throw exception;
                }
            }
        }
        if (lastException != null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "all ai providers failed for stream: " + lastException.getMessage());
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "no available ai provider for stream");
    }

    private AiProviderResponse doGenerate(AiProviderRequest request) {
        if (request == null || request.prompt() == null || request.prompt().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai provider request prompt is required");
        }
        ProviderRoutingPolicy policy = policyService.currentPolicy();
        List<AiProviderType> candidates = policy.orderedCandidates(request.provider());
        if (!policy.isEnableFailover() && !candidates.isEmpty()) {
            candidates = List.of(candidates.get(0));
        }
        if (candidates.isEmpty()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "no ai provider configured");
        }

        AiProviderType initialProvider = candidates.get(0);
        AiProviderType lastFailedProvider = null;
        RuntimeException lastException = null;
        boolean hadFailureOrSkip = false;

        for (AiProviderType providerType : candidates) {
            Optional<AiProvider> provider = Optional.ofNullable(providers.get(providerType));
            if (provider.isEmpty()) {
                hadFailureOrSkip = true;
                lastFailedProvider = providerType;
                recordEvent("PROVIDER_UNAVAILABLE", providerType, null, null, request, "provider adapter is not registered", 0L, 0, null, Map.of());
                continue;
            }

            ProviderCallPermission permission = circuitBreaker.beforeCall(providerType, policy);
            if (!permission.allowed()) {
                hadFailureOrSkip = true;
                lastFailedProvider = providerType;
                recordEvent("CIRCUIT_SKIP", providerType, null, null, request, permission.reason(), 0L, 0, null,
                        Map.of("circuitState", permission.snapshot().state().name()));
                continue;
            }

            int attempts = policy.getMaxRetries() + 1;
            for (int attempt = 1; attempt <= attempts; attempt++) {
                if (attempt > 1) {
                    metricsService.recordRetry(providerType);
                    recordEvent("RETRY", providerType, null, null, request, "retry provider attempt " + attempt, 0L, attempt, null, Map.of());
                }
                Instant startedAt = Instant.now();
                try {
                    metricsService.recordCall(providerType);
                    AiProviderRequest routedRequest = request.withProvider(providerType)
                            .withTimeout(policy.effectiveRequestTimeout(request.timeout()));
                    AiProviderResponse response = provider.get().generate(routedRequest);
                    Map<String, Object> responseMetadata = pricingSnapshotService.addCostMetadata(
                            response.metadata(), providerType, response.model(), startedAt);
                    AiProviderResponse enrichedResponse = new AiProviderResponse(
                            response.provider(), response.model(), response.text(), responseMetadata);
                    Duration latency = Duration.between(startedAt, Instant.now());
                    circuitBreaker.onSuccess(providerType, permission.halfOpenProbe(), policy);
                    stateRepository.saveHealth(AiProviderHealth.up(providerType, latency.toMillis(), "provider request succeeded", responseMetadata), policy.getHealthCheckInterval().plusSeconds(60));
                    stateRepository.saveActiveProvider(providerType, policy.getHealthCheckInterval().plus(policy.getCircuitOpenDuration()).plusSeconds(60));
                    metricsService.recordSuccess(providerType, latency);
                    if (hadFailureOrSkip && providerType != initialProvider) {
                        AiProviderType fromProvider = lastFailedProvider == null ? initialProvider : lastFailedProvider;
                        metricsService.recordFailover(fromProvider, providerType);
                        recordEvent("FAILOVER", providerType, fromProvider, providerType, request,
                                "provider failover " + fromProvider + " -> " + providerType, latency.toMillis(), attempt, null, Map.of());
                    }
                    recordEvent("SUCCESS", providerType, null, null, request, "provider request succeeded", latency.toMillis(), attempt, null, responseMetadata);
                    return enrichedResponse;
                } catch (RuntimeException exception) {
                    Duration latency = Duration.between(startedAt, Instant.now());
                    ProviderFailureType failureType = ProviderFailureClassifier.classify(exception);
                    boolean opened = circuitBreaker.onFailure(providerType, failureType, exception.getMessage(), permission.halfOpenProbe(), policy);
                    if (opened) {
                        metricsService.recordCircuitOpen(providerType);
                        recordEvent("CIRCUIT_OPEN", providerType, null, null, request,
                                "provider circuit opened after " + failureType, latency.toMillis(), attempt, exception.getMessage(),
                                Map.of("failureType", failureType.name()));
                    }
                    metricsService.recordFailure(providerType, failureType, latency);
                    recordEvent("ERROR", providerType, null, null, request,
                            "provider request failed: " + failureType, latency.toMillis(), attempt, exception.getMessage(),
                            Map.of("failureType", failureType.name()));
                    log.warn("AI provider request failed provider={}, model={}, attempt={}, failureType={}",
                            providerType, request.model(), attempt, failureType, exception);
                    lastFailedProvider = providerType;
                    lastException = exception;
                    hadFailureOrSkip = true;
                    if (opened) {
                        break;
                    }
                    if (!shouldRetry(policy, failureType, attempt, attempts, permission.halfOpenProbe())) {
                        break;
                    }
                    sleepBeforeRetry(policy, attempt);
                }
            }
        }

        if (lastException != null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "all ai providers failed, lastProvider=" + lastFailedProvider + ", reason=" + lastException.getMessage());
        }
        throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "no available ai provider in routing policy");
    }

    private boolean shouldRetry(ProviderRoutingPolicy policy,
                                ProviderFailureType failureType,
                                int attempt,
                                int attempts,
                                boolean halfOpenProbe) {
        return !halfOpenProbe && failureType.isRetryable() && attempt < attempts && policy.getMaxRetries() > 0;
    }

    private void sleepBeforeRetry(ProviderRoutingPolicy policy, int attempt) {
        Duration backoff = policy.getRetryInitialBackoff().multipliedBy((long) Math.pow(2, Math.max(0, attempt - 1)));
        if (backoff.compareTo(policy.getRetryMaxBackoff()) > 0) {
            backoff = policy.getRetryMaxBackoff();
        }
        if (backoff.isZero() || backoff.isNegative()) {
            return;
        }
        try {
            Thread.sleep(backoff.toMillis());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "ai provider retry interrupted");
        }
    }

    private void recordEvent(String eventType,
                             AiProviderType provider,
                             AiProviderType fromProvider,
                             AiProviderType toProvider,
                             AiProviderRequest request,
                             String message,
                             long latencyMillis,
                             int attempt,
                             String errorMessage,
                             Map<String, Object> metadata) {
        Map<String, Object> safeMetadata = metadata == null ? Map.of() : new LinkedHashMap<>(metadata);
        logService.record(AIInferenceLog.of(eventType, provider, fromProvider, toProvider, request.model(), message, latencyMillis, attempt, errorMessage, safeMetadata));
    }
}
