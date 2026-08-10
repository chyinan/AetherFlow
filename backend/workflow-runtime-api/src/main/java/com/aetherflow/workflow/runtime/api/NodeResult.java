package com.aetherflow.workflow.runtime.api;

import java.util.Map;

public record NodeResult(
        boolean successful,
        boolean waiting,
        Map<String, Object> output,
        Map<String, Object> variables,
        String nextNodeId,
        String branchKey
) {

    public NodeResult {
        output = output == null ? Map.of() : Map.copyOf(output);
        variables = variables == null ? Map.of() : Map.copyOf(variables);
    }

    public NodeResult(boolean successful,
                      Map<String, Object> output,
                      Map<String, Object> variables,
                      String nextNodeId,
                      String branchKey) {
        this(successful, false, output, variables, nextNodeId, branchKey);
    }

    public static NodeResult success(Map<String, Object> output) {
        return new NodeResult(true, false, output, Map.of(), null, null);
    }

    public static NodeResult success(Map<String, Object> output, Map<String, Object> variables) {
        return new NodeResult(true, false, output, variables, null, null);
    }

    public static NodeResult waiting(Map<String, Object> output) {
        return new NodeResult(true, true, output, Map.of(), null, null);
    }

    public NodeResult withNextNodeId(String nextNodeId) {
        return new NodeResult(successful, waiting, output, variables, nextNodeId, branchKey);
    }

    public NodeResult withBranchKey(String branchKey) {
        return new NodeResult(successful, waiting, output, variables, nextNodeId, branchKey);
    }
}
