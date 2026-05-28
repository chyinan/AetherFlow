package com.aetherflow.workflow.runtime.api;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NodeRegistryTest {

    @Test
    void resolvesExecutorsByNodeType() {
        StubExecutor executor = new StubExecutor("SUMMARY");
        NodeRegistry registry = new NodeRegistry(List.of(executor));

        assertThat(registry.getRequired(NodeType.of("summary"))).isSameAs(executor);
    }

    @Test
    void supportsDynamicRegistrationAndRejectsDuplicates() {
        NodeRegistry registry = new NodeRegistry(List.of());
        StubExecutor executor = new StubExecutor("EXPORT");

        registry.register(executor);

        assertThat(registry.getRequired(NodeType.of("EXPORT"))).isSameAs(executor);
        assertThatThrownBy(() -> registry.register(new StubExecutor("export")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("already registered");
    }

    @Test
    void rejectsMissingExecutors() {
        NodeRegistry registry = new NodeRegistry(List.of());

        assertThatThrownBy(() -> registry.getRequired(NodeType.of("WHISPER")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("WHISPER");
    }

    private record StubExecutor(String type) implements NodeExecutor {

        @Override
        public NodeType nodeType() {
            return NodeType.of(type);
        }

        @Override
        public NodeResult execute(WorkflowContext context) {
            return NodeResult.success(Map.of("ok", true));
        }
    }
}
