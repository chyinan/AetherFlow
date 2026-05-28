package com.aetherflow.workflow.runtime.dag;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

public class WorkflowDag {

    private final Map<String, WorkflowNodeDTO> nodesById;
    private final List<String> orderedNodeIds;
    private final boolean orderedFallbackEnabled;

    private WorkflowDag(Map<String, WorkflowNodeDTO> nodesById,
                        List<String> orderedNodeIds,
                        boolean orderedFallbackEnabled) {
        this.nodesById = nodesById;
        this.orderedNodeIds = orderedNodeIds;
        this.orderedFallbackEnabled = orderedFallbackEnabled;
    }

    public static WorkflowDag from(WorkflowDefinitionDTO definition) {
        Objects.requireNonNull(definition, "definition must not be null");
        if (definition.getNodes() == null || definition.getNodes().isEmpty()) {
            throw new IllegalArgumentException("workflow definition must contain nodes");
        }
        Map<String, WorkflowNodeDTO> nodes = new LinkedHashMap<>();
        List<String> orderedIds = new ArrayList<>();
        boolean hasExplicitEdges = false;
        for (WorkflowNodeDTO node : definition.getNodes()) {
            if (node.getNodeId() == null || node.getNodeId().isBlank()) {
                throw new IllegalArgumentException("workflow node id must not be blank");
            }
            if (node.getNodeType() == null || node.getNodeType().isBlank()) {
                throw new IllegalArgumentException("workflow node type must not be blank");
            }
            WorkflowNodeDTO previous = nodes.putIfAbsent(node.getNodeId(), node);
            if (previous != null) {
                throw new IllegalArgumentException("duplicate workflow node id: " + node.getNodeId());
            }
            orderedIds.add(node.getNodeId());
            hasExplicitEdges = hasExplicitEdges || hasExplicitEdgeConfig(node);
        }
        return new WorkflowDag(Map.copyOf(nodes), List.copyOf(orderedIds), !hasExplicitEdges);
    }

    public String startNodeId() {
        return orderedNodeIds.get(0);
    }

    public WorkflowNodeDTO node(String nodeId) {
        WorkflowNodeDTO node = nodesById.get(nodeId);
        if (node == null) {
            throw new IllegalArgumentException("workflow node not found: " + nodeId);
        }
        return node;
    }

    public List<String> nextNodeIds(String nodeId, NodeResult result) {
        WorkflowNodeDTO node = node(nodeId);
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();

        if (hasText(result.nextNodeId())) {
            return validatedTargets(List.of(result.nextNodeId()));
        }

        if (hasText(result.branchKey())) {
            Optional<String> branchTarget = branchTarget(config, result.branchKey());
            if (branchTarget.isPresent()) {
                return validatedTargets(List.of(branchTarget.get()));
            }
            Optional<String> defaultNext = stringValue(config.get("defaultNext"));
            if (defaultNext.isPresent()) {
                return validatedTargets(List.of(defaultNext.get()));
            }
            return List.of();
        }

        List<String> configuredTargets = configuredTargets(config);
        if (!configuredTargets.isEmpty()) {
            return validatedTargets(configuredTargets);
        }

        int currentIndex = orderedNodeIds.indexOf(nodeId);
        if (orderedFallbackEnabled && currentIndex >= 0 && currentIndex + 1 < orderedNodeIds.size()) {
            return List.of(orderedNodeIds.get(currentIndex + 1));
        }
        return List.of();
    }

    private static boolean hasExplicitEdgeConfig(WorkflowNodeDTO node) {
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
        return config.containsKey("next")
                || config.containsKey("nextNodes")
                || config.containsKey("branches")
                || config.containsKey("defaultNext");
    }

    private List<String> configuredTargets(Map<String, Object> config) {
        Object nextNodes = config.get("nextNodes");
        if (nextNodes instanceof Iterable<?> iterable) {
            List<String> targets = new ArrayList<>();
            for (Object item : iterable) {
                stringValue(item).ifPresent(targets::add);
            }
            return targets;
        }
        Optional<String> next = stringValue(config.get("next"));
        if (next.isPresent()) {
            return List.of(next.get());
        }
        Optional<String> defaultNext = stringValue(config.get("defaultNext"));
        return defaultNext.map(List::of).orElseGet(List::of);
    }

    private Optional<String> branchTarget(Map<String, Object> config, String branchKey) {
        Object branches = config.get("branches");
        if (!(branches instanceof Map<?, ?> branchMap)) {
            return Optional.empty();
        }
        Object target = branchMap.get(branchKey);
        return stringValue(target);
    }

    private List<String> validatedTargets(List<String> targets) {
        for (String target : targets) {
            if (!nodesById.containsKey(target)) {
                throw new IllegalArgumentException("workflow edge target not found: " + target);
            }
        }
        return targets;
    }

    private Optional<String> stringValue(Object value) {
        if (value instanceof String text && hasText(text)) {
            return Optional.of(text);
        }
        return Optional.empty();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
