package com.aetherflow.ai.provider;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class ProviderRecoveryService {

    private final ProviderRoutingPolicyService policyService;
    private final ProviderCircuitBreaker circuitBreaker;
    private final ProviderStateRepository stateRepository;
    private final AIInferenceLogService logService;

    public void recover(AiProviderType provider) {
        ProviderRoutingPolicy policy = policyService.currentPolicy();
        if (!policy.getProviders().contains(provider)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "provider is not configured in current policy: " + provider);
        }
        circuitBreaker.close(provider, policy);
        stateRepository.saveActiveProvider(provider, policy.getHealthCheckInterval().plus(policy.getCircuitOpenDuration()).plusSeconds(60));
        logService.record(AIInferenceLog.of(
                "MANUAL_RECOVERY",
                provider,
                null,
                provider,
                null,
                "manual provider recovery",
                0L,
                0,
                null,
                Map.of()
        ));
    }
}
