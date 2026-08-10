package com.aetherflow.workflow.runtime.api;

import java.util.Map;

// pattern: Functional Core
public final class NodeWaitingException extends RuntimeException {

    private final Map<String, Object> output;

    public NodeWaitingException(Map<String, Object> output) {
        super("node is waiting for an external result");
        this.output = output == null ? Map.of() : Map.copyOf(output);
    }

    public Map<String, Object> output() {
        return output;
    }
}
