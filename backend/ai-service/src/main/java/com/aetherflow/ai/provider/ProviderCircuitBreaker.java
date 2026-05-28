package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProviderCircuitBreaker {

    private final ProviderStateRepository repository;
    private final AiTaskProperties properties;

    public ProviderCallPermission beforeCall(AiProviderType provider) {
        return beforeCall(provider, defaultPolicy());
    }

    public ProviderCallPermission beforeCall(AiProviderType provider, ProviderRoutingPolicy policy) {
        ProviderCircuitSnapshot snapshot = repository.readCircuit(provider);
        if (snapshot == null) {
            snapshot = ProviderCircuitSnapshot.closed(provider);
        }
        if (snapshot.state() == ProviderCircuitState.CLOSED) {
            return ProviderCallPermission.allow(snapshot, false);
        }
        if (snapshot.state() == ProviderCircuitState.OPEN) {
            if (snapshot.openUntil() != null && Instant.now().isBefore(snapshot.openUntil())) {
                return ProviderCallPermission.reject(snapshot, "circuit open until " + snapshot.openUntil());
            }
            return halfOpenProbe(provider, snapshot, policy);
        }
        return halfOpenProbe(provider, snapshot, policy);
    }

    public void onSuccess(AiProviderType provider, boolean halfOpenProbe) {
        onSuccess(provider, halfOpenProbe, defaultPolicy());
    }

    public void onSuccess(AiProviderType provider, boolean halfOpenProbe, ProviderRoutingPolicy policy) {
        repository.resetFailureCount(provider);
        repository.releaseHalfOpenProbe(provider);
        ProviderCircuitSnapshot snapshot = new ProviderCircuitSnapshot(provider, ProviderCircuitState.CLOSED, 0, null, Instant.now(), null);
        repository.saveCircuit(snapshot, stateTtl(policy));
        log.debug("Provider circuit closed provider={}", provider);
    }

    public boolean onFailure(AiProviderType provider, ProviderFailureType failureType, String reason, boolean halfOpenProbe) {
        return onFailure(provider, failureType, reason, halfOpenProbe, defaultPolicy());
    }

    public boolean onFailure(AiProviderType provider,
                             ProviderFailureType failureType,
                             String reason,
                             boolean halfOpenProbe,
                             ProviderRoutingPolicy policy) {
        if (!failureType.isCircuitEligible()) {
            return false;
        }
        int failures = repository.incrementFailureCount(provider, stateTtl(policy));
        if (halfOpenProbe || failures >= policy.getCircuitFailureThreshold()) {
            open(provider, failures, reason, policy);
            return true;
        } else {
            ProviderCircuitSnapshot snapshot = new ProviderCircuitSnapshot(provider, ProviderCircuitState.CLOSED, failures, null, Instant.now(), reason);
            repository.saveCircuit(snapshot, stateTtl(policy));
            return false;
        }
    }

    public void open(AiProviderType provider, int failures, String reason) {
        open(provider, failures, reason, defaultPolicy());
    }

    public void open(AiProviderType provider, int failures, String reason, ProviderRoutingPolicy policy) {
        repository.releaseHalfOpenProbe(provider);
        Instant openUntil = Instant.now().plus(policy.getCircuitOpenDuration());
        ProviderCircuitSnapshot snapshot = new ProviderCircuitSnapshot(provider, ProviderCircuitState.OPEN, Math.max(1, failures), openUntil, Instant.now(), reason);
        repository.saveCircuit(snapshot, stateTtl(policy));
        log.warn("Provider circuit opened provider={}, failures={}, openUntil={}, reason={}", provider, failures, openUntil, reason);
    }

    public void close(AiProviderType provider) {
        onSuccess(provider, false);
    }

    public void close(AiProviderType provider, ProviderRoutingPolicy policy) {
        onSuccess(provider, false, policy);
    }

    private ProviderCallPermission halfOpenProbe(AiProviderType provider, ProviderCircuitSnapshot snapshot) {
        return halfOpenProbe(provider, snapshot, defaultPolicy());
    }

    private ProviderCallPermission halfOpenProbe(AiProviderType provider, ProviderCircuitSnapshot snapshot, ProviderRoutingPolicy policy) {
        boolean acquired = repository.tryAcquireHalfOpenProbe(provider, probeTtl(policy));
        if (!acquired) {
            return ProviderCallPermission.reject(snapshot, "half-open probe already in flight");
        }
        ProviderCircuitSnapshot halfOpen = new ProviderCircuitSnapshot(
                provider,
                ProviderCircuitState.HALF_OPEN,
                snapshot.consecutiveFailures(),
                snapshot.openUntil(),
                Instant.now(),
                snapshot.reason()
        );
        repository.saveCircuit(halfOpen, stateTtl(policy));
        return ProviderCallPermission.allow(halfOpen, true);
    }

    private Duration stateTtl(ProviderRoutingPolicy policy) {
        return policy.getCircuitOpenDuration()
                .plus(policy.getHealthCheckInterval())
                .plusSeconds(60);
    }

    private Duration probeTtl(ProviderRoutingPolicy policy) {
        return policy.getCircuitOpenDuration().dividedBy(2).plusSeconds(5);
    }

    private ProviderRoutingPolicy defaultPolicy() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setCircuitFailureThreshold(properties.getProviderCircuitFailureThreshold());
        policy.setCircuitOpenDuration(properties.getProviderCircuitOpenDuration());
        policy.setHealthCheckInterval(properties.getProviderHealthCheckInterval());
        return policy.normalized();
    }
}
