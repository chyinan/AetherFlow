package com.aetherflow.ai.capability;

import com.aetherflow.ai.image.ImageProviderRegistry;
import com.aetherflow.ai.provider.ProviderRuntimeCatalogClient;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.dto.AiWorkflowCapabilitiesDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

// pattern: Imperative Shell
@Service
@RequiredArgsConstructor
public class AiWorkflowCapabilityService {

    private final ProviderRuntimeCatalogClient runtimeCatalogClient;
    private final DefaultAiNodeExecutorRegistry executorRegistry;
    private final ImageProviderRegistry imageProviderRegistry;

    public AiWorkflowCapabilitiesDTO current() {
        return AiWorkflowCapabilityEvaluator.evaluate(
                runtimeCatalogClient.catalog(),
                executorRegistry.availableNodeTypes(),
                imageProviderRegistry.availableProviderNames()
        );
    }
}
