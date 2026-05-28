package com.aetherflow.workflow.runtime.api;

import java.util.Locale;

public record NodeType(String value) {

    public static final NodeType CONDITION = NodeType.of("CONDITION");
    public static final NodeType START = NodeType.of("START");
    public static final NodeType END = NodeType.of("END");

    public NodeType {
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("node type must not be blank");
        }
        value = value.trim().toUpperCase(Locale.ROOT);
    }

    public static NodeType of(String value) {
        return new NodeType(value);
    }

    @Override
    public String toString() {
        return value;
    }
}
