package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class HttpRequestConfigValidatorTest {
    @Test void validatesRequestSchemaAndBothRequiredBranches() {
        assertThat(validate(Map.of("urlVariable", "requestUrl", "method", "POST", "bodyJson", "[1,2]"))).isEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "method", "POST", "bodyJson", "{} {}"))).isNotEmpty();
        assertThat(validate(Map.of("method", "GET"))).isNotEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "method", "GET", "bodyJson", "{}"))).isNotEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "method", "POST", "bodyJson", "{}", "bodyVariable", "payload"))).isNotEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "errorStrategy", "BRANCH", "branches", Map.of("success", "next")))).isNotEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "errorStrategy", "BRANCH", "branches", Map.of("success", "next", "error", "recover")))).isEmpty();
        assertThat(validate(Map.of("urlVariable", "requestUrl", "method", "CONNECT"))).isNotEmpty();
    }

    private java.util.List<String> validate(Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId("http");
        node.setNodeType("HTTP_REQUEST");
        node.setConfig(config);
        return WorkflowNodeConfigValidator.validate(node, new WorkflowNodeCatalogService().catalog());
    }
}
