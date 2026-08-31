package com.aetherflow.workflow.embedding.store;

import com.aetherflow.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

// pattern: Functional Core
class VectorStoreRegistryTest {

    @Test
    void refusesProcessMemoryStoreWhenProductionPolicyDisablesIt() {
        InMemoryVectorStore memoryStore = new InMemoryVectorStore();
        VectorStoreRegistry registry = new VectorStoreRegistry(List.of(memoryStore));
        registry.setInMemoryEnabled(false);

        assertThatThrownBy(() -> registry.select("memory"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("in-memory vector store is disabled");
    }
}
