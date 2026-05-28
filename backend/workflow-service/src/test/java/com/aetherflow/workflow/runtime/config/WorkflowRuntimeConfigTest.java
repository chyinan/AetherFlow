package com.aetherflow.workflow.runtime.config;

import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowRuntimeConfigTest {

    @Test
    void createsNodeRegistryFromSpringDiscoveredExecutors() {
        WorkflowRuntimeConfig config = new WorkflowRuntimeConfig();
        StubExecutor executor = new StubExecutor();

        NodeRegistry registry = config.nodeRegistry(List.of(executor));

        assertThat(registry.getRequired(NodeType.of("TEST_NODE"))).isSameAs(executor);
    }

    private static final class StubExecutor implements NodeExecutor {

        @Override
        public NodeType nodeType() {
            return NodeType.of("TEST_NODE");
        }

        @Override
        public NodeResult execute(WorkflowContext context) {
            return NodeResult.success(Map.of());
        }
    }
}
