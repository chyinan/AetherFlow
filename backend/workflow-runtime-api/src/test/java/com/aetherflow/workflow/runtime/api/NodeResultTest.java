package com.aetherflow.workflow.runtime.api;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class NodeResultTest {

    @Test
    void copiesOutputAndVariablesAsReadOnlyMaps() {
        Map<String, Object> output = new HashMap<>();
        output.put("text", "done");
        Map<String, Object> variables = new HashMap<>();
        variables.put("language", "zh-CN");

        NodeResult result = NodeResult.success(output, variables);
        output.put("text", "changed");
        variables.put("language", "en-US");

        assertThat(result.output()).containsEntry("text", "done");
        assertThat(result.variables()).containsEntry("language", "zh-CN");
        assertThatThrownBy(() -> result.output().put("x", true))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> result.variables().put("x", true))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void canCarryNextNodeAndBranchDecision() {
        NodeResult result = NodeResult.success(Map.of("score", 90))
                .withNextNodeId("node-export")
                .withBranchKey("approved");

        assertThat(result.nextNodeId()).isEqualTo("node-export");
        assertThat(result.branchKey()).isEqualTo("approved");
    }
}
