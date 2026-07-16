package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class VectorStoreRegistry {

    private final List<WorkflowVectorStore> stores;

    public WorkflowVectorStore select(String providerName) {
        String normalized = normalize(providerName);
        return stores.stream()
                .filter(store -> normalize(store.providerName()).equals(normalized))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ResultCode.BAD_REQUEST, "vector store provider is not configured"));
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return "memory";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return "mock".equals(normalized) ? "memory" : normalized;
    }
}
