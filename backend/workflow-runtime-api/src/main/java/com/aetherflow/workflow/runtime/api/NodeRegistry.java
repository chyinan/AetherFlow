package com.aetherflow.workflow.runtime.api;

import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

public class NodeRegistry {

    private final ConcurrentMap<NodeType, NodeExecutor> executors = new ConcurrentHashMap<>();

    public NodeRegistry(Collection<? extends NodeExecutor> executors) {
        if (executors != null) {
            executors.forEach(this::register);
        }
    }

    public void register(NodeExecutor executor) {
        Objects.requireNonNull(executor, "executor must not be null");
        NodeType nodeType = Objects.requireNonNull(executor.nodeType(), "executor nodeType must not be null");
        NodeExecutor previous = executors.putIfAbsent(nodeType, executor);
        if (previous != null) {
            throw new IllegalStateException("node executor already registered for node type " + nodeType.value());
        }
    }

    public Optional<NodeExecutor> get(NodeType nodeType) {
        return Optional.ofNullable(executors.get(Objects.requireNonNull(nodeType, "nodeType must not be null")));
    }

    public NodeExecutor getRequired(NodeType nodeType) {
        return get(nodeType)
                .orElseThrow(() -> new IllegalArgumentException(
                        "node executor not registered for node type " + nodeType.value()));
    }

    public Map<NodeType, NodeExecutor> registeredExecutors() {
        return Map.copyOf(executors);
    }
}
