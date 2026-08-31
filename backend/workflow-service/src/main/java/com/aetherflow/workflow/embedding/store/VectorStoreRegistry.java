package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class VectorStoreRegistry {

    private final List<WorkflowVectorStore> stores;

    @Value("${aetherflow.workflow.embedding.in-memory-enabled:true}")
    private boolean inMemoryEnabled = true;

    public WorkflowVectorStore select(String providerName) {
        String normalized = normalize(providerName);
        if ("memory".equals(normalized) && !inMemoryEnabled) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "in-memory vector store is disabled in this environment");
        }
        return stores.stream()
                .filter(store -> normalize(store.providerName()).equals(normalized))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ResultCode.BAD_REQUEST, "vector store provider is not configured"));
    }

    void setInMemoryEnabled(boolean inMemoryEnabled) {
        this.inMemoryEnabled = inMemoryEnabled;
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "memory";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return "mock".equals(normalized) ? "memory" : normalized;
    }
}
