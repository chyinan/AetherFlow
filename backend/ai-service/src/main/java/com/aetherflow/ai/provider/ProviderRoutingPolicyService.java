package com.aetherflow.ai.provider;

import com.aetherflow.ai.config.AiTaskProperties;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProviderRoutingPolicyService {

    private final ProviderRoutingPolicyRepository repository;
    private final AiTaskProperties properties;

    public ProviderRoutingPolicy currentPolicy() {
        ProviderRoutingPolicy policy = repository.load();
        if (policy == null) {
            policy = defaultPolicy();
            try {
                repository.save(policy);
            } catch (RuntimeException exception) {
                log.warn("Failed to seed default provider routing policy", exception);
            }
        }
        return policy.normalized();
    }

    public ProviderRoutingPolicy updatePolicy(ProviderRoutingPolicy policy) {
        if (policy == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "provider routing policy is required");
        }
        ProviderRoutingPolicy normalized = policy.normalized();
        repository.save(normalized);
        return normalized;
    }

    public List<AiProviderType> orderedCandidates(AiProviderType requestedProvider) {
        return currentPolicy().orderedCandidates(requestedProvider);
    }

    private ProviderRoutingPolicy defaultPolicy() {
        ProviderRoutingPolicy policy = new ProviderRoutingPolicy();
        policy.setEnableFailover(properties.isProviderFailoverEnabled());
        policy.setAutoRecoverPrimary(properties.isProviderAutoRecoverPrimary());
        policy.setProviders(properties.getProviderPriority());
        policy.setMaxRetries(properties.getProviderRetryMaxAttempts());
        policy.setRetryInitialBackoff(properties.getProviderRetryInitialBackoff());
        policy.setRetryMaxBackoff(properties.getProviderRetryMaxBackoff());
        policy.setRequestTimeout(properties.getProviderTimeout());
        policy.setCircuitFailureThreshold(properties.getProviderCircuitFailureThreshold());
        policy.setCircuitOpenDuration(properties.getProviderCircuitOpenDuration());
        policy.setHealthCheckInterval(properties.getProviderHealthCheckInterval());
        return policy.normalized();
    }
}
