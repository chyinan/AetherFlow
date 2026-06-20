package com.aetherflow.workflow.runtime.dag;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;

import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;

public class WorkflowDag {

    private final Map<String, WorkflowNodeDTO> nodesById;
    private final List<String> orderedNodeIds;
    private final Map<String, List<String>> outgoingEdges;
    private final Map<String, List<String>> incomingEdges;
    private final List<String> startNodeIds;
    private final boolean orderedFallbackEnabled;

    private WorkflowDag(Map<String, WorkflowNodeDTO> nodesById,
                        List<String> orderedNodeIds,
                        Map<String, List<String>> outgoingEdges,
                        Map<String, List<String>> incomingEdges,
                        List<String> startNodeIds,
                        boolean orderedFallbackEnabled) {
        this.nodesById = nodesById;
        this.orderedNodeIds = orderedNodeIds;
        this.outgoingEdges = outgoingEdges;
        this.incomingEdges = incomingEdges;
        this.startNodeIds = startNodeIds;
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
        Map<String, List<String>> outgoingEdges = buildOutgoingEdges(nodes, orderedIds, !hasExplicitEdges);
        Map<String, List<String>> incomingEdges = buildIncomingEdges(nodes, outgoingEdges);
        validateAcyclic(orderedIds, outgoingEdges, incomingEdges);
        List<String> startNodeIds = startNodeIds(orderedIds, incomingEdges);
        validateReachable(orderedIds, outgoingEdges, startNodeIds);
        return new WorkflowDag(
                Map.copyOf(nodes),
                List.copyOf(orderedIds),
                copyEdgeMap(outgoingEdges),
                copyEdgeMap(incomingEdges),
                startNodeIds,
                !hasExplicitEdges
        );
    }

    public String startNodeId() {
        return startNodeIds.get(0);
    }

    public List<String> startNodeIds() {
        return startNodeIds;
    }

    public WorkflowNodeDTO node(String nodeId) {
        WorkflowNodeDTO node = nodesById.get(nodeId);
        if (node == null) {
            throw new IllegalArgumentException("workflow node not found: " + nodeId);
        }
        return node;
    }

    public int nodeCount() {
        return orderedNodeIds.size();
    }

    public List<String> nodeIds() {
        return orderedNodeIds;
    }

    public List<String> predecessorNodeIds(String nodeId) {
        node(nodeId);
        return incomingEdges.getOrDefault(nodeId, List.of());
    }

    public int requiredPredecessorCount(String nodeId) {
        return predecessorNodeIds(nodeId).size();
    }

    public List<String> nextNodeIds(String nodeId, NodeResult result) {
        WorkflowNodeDTO node = node(nodeId);
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();

        if (hasText(result.nextNodeId())) {
            return validatedTargets(nodeId, List.of(result.nextNodeId()));
        }

        if (hasText(result.branchKey())) {
            Optional<String> branchTarget = branchTarget(config, result.branchKey());
            if (branchTarget.isPresent()) {
                return validatedTargets(nodeId, List.of(branchTarget.get()));
            }
            Optional<String> defaultNext = stringValue(config.get("defaultNext"));
            if (defaultNext.isPresent()) {
                return validatedTargets(nodeId, List.of(defaultNext.get()));
            }
            return List.of();
        }

        List<String> configuredTargets = configuredTargets(config);
        if (!configuredTargets.isEmpty()) {
            return validatedTargets(nodeId, configuredTargets);
        }

        int currentIndex = orderedNodeIds.indexOf(nodeId);
        if (orderedFallbackEnabled && currentIndex >= 0 && currentIndex + 1 < orderedNodeIds.size()) {
            return List.of(orderedNodeIds.get(currentIndex + 1));
        }
        return List.of();
    }

    private static Map<String, List<String>> buildOutgoingEdges(Map<String, WorkflowNodeDTO> nodes,
                                                                List<String> orderedIds,
                                                                boolean orderedFallbackEnabled) {
        Map<String, List<String>> edges = new LinkedHashMap<>();
        for (String nodeId : orderedIds) {
            WorkflowNodeDTO node = nodes.get(nodeId);
            List<String> targets = orderedFallbackEnabled
                    ? orderedFallbackTargets(orderedIds, nodeId)
                    : configuredGraphTargets(node);
            validateTargets(nodes, targets);
            edges.put(nodeId, List.copyOf(targets));
        }
        return edges;
    }

    private static Map<String, List<String>> buildIncomingEdges(Map<String, WorkflowNodeDTO> nodes,
                                                                Map<String, List<String>> outgoingEdges) {
        Map<String, List<String>> incomingEdges = new LinkedHashMap<>();
        for (String nodeId : nodes.keySet()) {
            incomingEdges.put(nodeId, new ArrayList<>());
        }
        for (Map.Entry<String, List<String>> entry : outgoingEdges.entrySet()) {
            for (String target : entry.getValue()) {
                incomingEdges.get(target).add(entry.getKey());
            }
        }
        return incomingEdges;
    }

    private static Map<String, List<String>> copyEdgeMap(Map<String, List<String>> edges) {
        Map<String, List<String>> copy = new LinkedHashMap<>();
        for (Map.Entry<String, List<String>> entry : edges.entrySet()) {
            copy.put(entry.getKey(), List.copyOf(entry.getValue()));
        }
        return Map.copyOf(copy);
    }

    private static List<String> startNodeIds(List<String> orderedIds, Map<String, List<String>> incomingEdges) {
        List<String> starts = new ArrayList<>();
        for (String nodeId : orderedIds) {
            if (incomingEdges.getOrDefault(nodeId, List.of()).isEmpty()) {
                starts.add(nodeId);
            }
        }
        if (starts.isEmpty()) {
            throw new IllegalArgumentException("workflow dag must contain at least one start node");
        }
        return List.copyOf(starts);
    }

    private static void validateAcyclic(List<String> orderedIds,
                                        Map<String, List<String>> outgoingEdges,
                                        Map<String, List<String>> incomingEdges) {
        Map<String, Integer> indegree = new LinkedHashMap<>();
        Queue<String> ready = new ArrayDeque<>();
        for (String nodeId : orderedIds) {
            int degree = incomingEdges.getOrDefault(nodeId, List.of()).size();
            indegree.put(nodeId, degree);
            if (degree == 0) {
                ready.add(nodeId);
            }
        }
        int visited = 0;
        while (!ready.isEmpty()) {
            String nodeId = ready.remove();
            visited++;
            for (String target : outgoingEdges.getOrDefault(nodeId, List.of())) {
                int remaining = indegree.compute(target, (ignored, current) -> current == null ? 0 : current - 1);
                if (remaining == 0) {
                    ready.add(target);
                }
            }
        }
        if (visited != orderedIds.size()) {
            throw new IllegalArgumentException("workflow dag contains cycle");
        }
    }

    private static void validateReachable(List<String> orderedIds,
                                          Map<String, List<String>> outgoingEdges,
                                          List<String> startNodeIds) {
        if (startNodeIds.isEmpty()) {
            throw new IllegalArgumentException("workflow dag must contain at least one start node");
        }
        Set<String> reachable = new HashSet<>();
        // Traverse from EVERY start node (zero-indegree / START-type node). Seeding the BFS
        // queue with only startNodeIds.get(0) silently lets nodes reachable from later start
        // nodes be misclassified as unreachable, which both rejects valid multi-source DAGs
        // and hides genuinely orphaned subgraphs that happen to sit behind the first start.
        Queue<String> queue = new ArrayDeque<>(startNodeIds);
        while (!queue.isEmpty()) {
            String nodeId = queue.remove();
            if (!reachable.add(nodeId)) {
                continue;
            }
            queue.addAll(outgoingEdges.getOrDefault(nodeId, List.of()));
        }
        for (String nodeId : orderedIds) {
            if (!reachable.contains(nodeId)) {
                throw new IllegalArgumentException("workflow dag contains unreachable node: " + nodeId);
            }
        }
    }

    private static List<String> orderedFallbackTargets(List<String> orderedIds, String nodeId) {
        int currentIndex = orderedIds.indexOf(nodeId);
        if (currentIndex >= 0 && currentIndex + 1 < orderedIds.size()) {
            return List.of(orderedIds.get(currentIndex + 1));
        }
        return List.of();
    }

    private static List<String> configuredGraphTargets(WorkflowNodeDTO node) {
        Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
        List<String> targets = new ArrayList<>();

        Object nextNodes = config.get("nextNodes");
        if (nextNodes instanceof Iterable<?> iterable) {
            for (Object item : iterable) {
                stringValue(item).ifPresent(targets::add);
            }
        }
        stringValue(config.get("next")).ifPresent(targets::add);
        stringValue(config.get("defaultNext")).ifPresent(targets::add);

        Object branches = config.get("branches");
        if (branches instanceof Map<?, ?> branchMap) {
            for (Object target : branchMap.values()) {
                stringValue(target).ifPresent(targets::add);
            }
        }
        return targets.stream().distinct().toList();
    }

    private static void validateTargets(Map<String, WorkflowNodeDTO> nodes, List<String> targets) {
        for (String target : targets) {
            if (!nodes.containsKey(target)) {
                throw new IllegalArgumentException("workflow edge target not found: " + target);
            }
        }
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

    private List<String> validatedTargets(String nodeId, List<String> targets) {
        List<String> declaredTargets = outgoingEdges.getOrDefault(nodeId, List.of());
        for (String target : targets) {
            if (!nodesById.containsKey(target)) {
                throw new IllegalArgumentException("workflow edge target not found: " + target);
            }
            if (!declaredTargets.contains(target)) {
                throw new IllegalArgumentException("workflow edge target is not declared: " + nodeId + " -> " + target);
            }
        }
        return targets;
    }

    private static Optional<String> stringValue(Object value) {
        if (value instanceof String text && hasText(text)) {
            return Optional.of(text);
        }
        return Optional.empty();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
