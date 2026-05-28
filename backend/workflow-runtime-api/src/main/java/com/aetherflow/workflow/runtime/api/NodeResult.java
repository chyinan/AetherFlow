package com.aetherflow.workflow.runtime.api;

import java.util.Map;

public record NodeResult(
        boolean successful,
        Map<String, Object> output,
        Map<String, Object> variables,
        String nextNodeId,
        String branchKey
) {

    public NodeResult {
        output = output == null ? Map.of() : Map.copyOf(output);
        variables = variables == null ? Map.of() : Map.copyOf(variables);
    }

    public static NodeResult success(Map<String, Object> output) {
        return new NodeResult(true, output, Map.of(), null, null);
    }

    public static NodeResult success(Map<String, Object> output, Map<String, Object> variables) {
        return new NodeResult(true, output, variables, null, null);
    }

    public NodeResult withNextNodeId(String nextNodeId) {
        return new NodeResult(successful, output, variables, nextNodeId, branchKey);
    }

    public NodeResult withBranchKey(String branchKey) {
        return new NodeResult(successful, output, variables, nextNodeId, branchKey);
    }
}
