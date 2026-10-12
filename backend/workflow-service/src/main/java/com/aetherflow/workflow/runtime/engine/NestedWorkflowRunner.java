package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;

import java.util.*;
import java.util.function.BiFunction;

/** 顺序循环体与有界异步批次；已完成的作用域输出是恢复检查点。 */
final class NestedWorkflowRunner {
    static final String TYPES = "__nestedNodeTypes";
    static final String CONTEXTS = "__nestedContexts";
    static final String WAITING = "nestedWaiting";
    private final DefaultWorkflowContext root;
    private final BiFunction<WorkflowNodeDTO, DefaultWorkflowContext, NodeResult> execute;
    private final Runnable checkActive;
    private final Runnable checkpoint;

    NestedWorkflowRunner(DefaultWorkflowContext root,
                         BiFunction<WorkflowNodeDTO, DefaultWorkflowContext, NodeResult> execute,
                         Runnable checkActive, Runnable checkpoint) {
        this.root = root;
        this.execute = execute;
        this.checkActive = checkActive;
        this.checkpoint = checkpoint;
    }

    NodeResult run(WorkflowNodeDTO control, Map<String, Object> variables) {
        Map<String, Object> config = control.getConfig() == null ? Map.of() : control.getConfig();
        List<WorkflowNodeDTO> body = bodyNodes(config.get("bodyNodes"));
        if (body.isEmpty()) return execute.apply(control, context(control.getNodeId(), config, variables));
        return "ITERATION".equalsIgnoreCase(control.getNodeType())
                ? iteration(control, config, body, variables) : loop(control, config, body, variables);
    }

    private NodeResult iteration(WorkflowNodeDTO control, Map<String, Object> config,
                                 List<WorkflowNodeDTO> body, Map<String, Object> variables) {
        Object input = config.containsKey("input") ? config.get("input")
                : variables.get(text(config, "inputVariable", "items"));
        List<?> items = input instanceof Collection<?> collection ? new ArrayList<>(collection)
                : input == null ? List.of() : Arrays.stream(String.valueOf(input).split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        int count = Math.min(items.size(), bounded(config, "maxIterations", items.size(), 1000));
        int concurrency = Math.max(1, bounded(config, "concurrency", 1, 8));
        List<Map<String, Object>> results = new ArrayList<>();
        List<String> waiting = new ArrayList<>();
        int active = 0;
        for (int index = 0; index < count; index++) {
            checkActive.run();
            String scope = control.getNodeId() + "/iteration-" + index;
            boolean started = root.nodeOutputs().keySet().stream().anyMatch(id -> id.startsWith(scope + "/"));
            if (active >= concurrency && !started) break;
            Map<String, Object> local = new LinkedHashMap<>(variables);
            String itemVariable = text(config, "itemVariable", "item");
            local.remove(itemVariable);
            if (items.get(index) != null) local.put(itemVariable, items.get(index));
            local.put(text(config, "indexVariable", "iterationIndex"), index);
            BodyResult result = body(scope, body, local);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("index", index);
            item.put("item", items.get(index));
            item.put("variables", result.variables());
            item.put("status", result.error() != null ? "FAILED" : result.waiting().isEmpty() ? "SUCCESS" : "WAITING");
            if (result.error() != null) {
                item.put("error", result.error());
                if (!"CONTINUE".equalsIgnoreCase(text(config, "failureStrategy", "STOP"))) {
                    results.add(Collections.unmodifiableMap(item));
                    root.recordNodeOutput(control.getNodeId(), new NodeResult(false,
                            Map.of("results", List.copyOf(results), "total", count, "error", result.error()), Map.of(), null, null));
                    checkpoint.run();
                    throw new IllegalStateException("循环项 " + index + " 失败：" + result.error());
                }
            }
            if (!result.waiting().isEmpty()) { waiting.addAll(result.waiting()); active++; }
            results.add(Collections.unmodifiableMap(item));
        }
        Map<String, Object> output = new LinkedHashMap<>();
        output.put("items", new ArrayList<>(items.subList(0, count)));
        output.put("results", results);
        output.put("count", results.stream().filter(item -> !"WAITING".equals(item.get("status"))).count());
        output.put("total", count);
        output.put("truncated", count < items.size());
        if (!waiting.isEmpty()) { output.put(WAITING, waiting); return NodeResult.waiting(output); }
        List<Map<String, Object>> values = results.stream().map(item -> {
            if (!"SUCCESS".equals(item.get("status"))) return item;
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("item", item.get("item")); value.put("variables", item.get("variables"));
            return Collections.unmodifiableMap(value);
        }).toList();
        return NodeResult.success(output, Map.of(text(config, "outputVariable", "iterationItems"), values));
    }

    private NodeResult loop(WorkflowNodeDTO control, Map<String, Object> config,
                            List<WorkflowNodeDTO> body, Map<String, Object> variables) {
        String input = text(config, "inputVariable", "state");
        String outputName = text(config, "outputVariable", "loopState");
        Object state = config.containsKey("input") ? config.get("input") : variables.get(input);
        int limit = bounded(config, "maxIterations", 1, 1000);
        int index = 0;
        boolean stopped = stop(state, text(config, "stopWhen", ""));
        List<Map<String, Object>> results = new ArrayList<>();
        while (!stopped && index < limit) {
            checkActive.run();
            Map<String, Object> local = new LinkedHashMap<>(variables);
            if (state != null) local.put(input, state);
            local.put(text(config, "indexVariable", "loopIteration"), index);
            BodyResult result = body(control.getNodeId() + "/loop-" + index, body, local);
            if (result.error() != null) {
                results.add(Map.of("index", index, "status", "FAILED", "variables", result.variables(), "error", result.error()));
                root.recordNodeOutput(control.getNodeId(), new NodeResult(false,
                        Map.of("results", List.copyOf(results), "error", result.error()), Map.of(), null, null));
                checkpoint.run();
                throw new IllegalStateException("循环轮次 " + index + " 失败：" + result.error());
            }
            if (!result.waiting().isEmpty()) return NodeResult.waiting(Map.of(WAITING, result.waiting(), "iterations", index, "results", results));
            state = result.variables().getOrDefault(outputName, result.variables().getOrDefault(input, state));
            results.add(Map.of("index", index, "status", "SUCCESS", "variables", result.variables()));
            index++;
            stopped = stop(state, text(config, "stopWhen", ""));
        }
        Object safeState = state == null ? "" : state;
        return NodeResult.success(Map.of("state", safeState, "iterations", index, "stopped", stopped,
                "bounded", index >= limit && !stopped, "results", results), Map.of(outputName, safeState));
    }

    private BodyResult body(String scope, List<WorkflowNodeDTO> body, Map<String, Object> initial) {
        Map<String, Object> variables = new LinkedHashMap<>(initial);
        Map<String, Object> outputs = new LinkedHashMap<>();
        for (WorkflowNodeDTO original : body) {
            checkActive.run();
            String id = scope + "/" + original.getNodeId();
            if (id.length() > 128) throw new IllegalArgumentException("循环体作用域 ID 超过 128 字符");
            WorkflowNodeDTO node = new WorkflowNodeDTO();
            node.setNodeId(id); node.setNodeType(original.getNodeType());
            node.setDisplayName(original.getDisplayName()); node.setConfig(original.getConfig());
            NodeResult result = root.nodeOutputs().get(id);
            if (result == null || (result.waiting() && result.output().containsKey(WAITING))) {
                remember(TYPES, id, node.getNodeType());
                DefaultWorkflowContext context = context(id, node.getConfig(), variables);
                try {
                    boolean nested = ("LOOP".equalsIgnoreCase(node.getNodeType()) || "ITERATION".equalsIgnoreCase(node.getNodeType()))
                            && node.getConfig().get("bodyNodes") != null;
                    result = nested ? run(node, variables) : execute.apply(node, context);
                } catch (RuntimeException failure) {
                    if (failure instanceof WorkflowCancellationException
                            || failure instanceof com.aetherflow.workflow.runtime.core.WorkflowRuntimeLeaseLostException) throw failure;
                    result = new NodeResult(false, Map.of("error", failure.getMessage() == null ? failure.getClass().getSimpleName() : failure.getMessage()), Map.of(), null, null);
                }
                root.recordNodeOutput(id, result);
                checkpoint.run();
            }
            if (result.waiting()) {
                Object nested = result.output().get(WAITING);
                return new BodyResult(outputs, nested instanceof Collection<?> collection
                        ? collection.stream().map(String::valueOf).toList() : List.of(id), null);
            }
            if (!result.successful()) return new BodyResult(outputs, List.of(), String.valueOf(result.output().getOrDefault("error", "节点执行失败")));
            variables.putAll(result.variables()); outputs.putAll(result.variables());
        }
        return new BodyResult(Collections.unmodifiableMap(outputs), List.of(), null);
    }

    private DefaultWorkflowContext context(String id, Map<String, Object> config, Map<String, Object> values) {
        Map<String, Object> variables = new LinkedHashMap<>(values);
        variables.remove(TYPES); variables.remove(CONTEXTS);
        Map<String, Object> configs = new LinkedHashMap<>();
        Object existing = variables.get(WorkflowNodeContextKeys.NODE_CONFIGS);
        if (existing instanceof Map<?, ?> map) map.forEach((key, value) -> configs.put(String.valueOf(key), value));
        configs.put(id, config == null ? Map.of() : config);
        variables.put(WorkflowNodeContextKeys.NODE_CONFIGS, configs);
        remember(CONTEXTS, id, Collections.unmodifiableMap(new LinkedHashMap<>(variables)));
        DefaultWorkflowContext context = new DefaultWorkflowContext(root.workflowId(), root.traceId(), root.taskId(), variables);
        context.updateRuntimeState(RuntimeState.RUNNING); context.updateCurrentNodeId(id);
        return context;
    }

    @SuppressWarnings("unchecked")
    private void remember(String key, String id, Object value) {
        synchronized (root.variables()) {
            Map<String, Object> entries = new LinkedHashMap<>();
            Object existing = root.variables().get(key);
            if (existing instanceof Map<?, ?> map) map.forEach((k, v) -> entries.put(String.valueOf(k), v));
            entries.put(id, value);
            root.variables().put(key, Collections.unmodifiableMap(entries));
        }
    }

    private static List<WorkflowNodeDTO> bodyNodes(Object raw) {
        if (!(raw instanceof Collection<?> collection) || collection.size() > 100)
            throw new IllegalArgumentException("循环体必须是最多 100 个节点的数组");
        List<WorkflowNodeDTO> nodes = new ArrayList<>(); Set<String> ids = new HashSet<>();
        for (Object entry : collection) {
            if (!(entry instanceof Map<?, ?> item)) throw new IllegalArgumentException("循环体节点必须是对象");
            WorkflowNodeDTO node = new WorkflowNodeDTO();
            String id = String.valueOf(item.get("nodeId"));
            if (id.isBlank() || "null".equals(id) || id.contains("/") || !ids.add(id)) throw new IllegalArgumentException("循环体节点 ID 必须唯一且不能包含斜线");
            node.setNodeId(id); node.setNodeType(String.valueOf(item.get("nodeType")));
            node.setDisplayName(String.valueOf(item.get("displayName")));
            Map<String, Object> config = new LinkedHashMap<>();
            if (item.get("config") instanceof Map<?, ?> map) map.forEach((k, v) -> config.put(String.valueOf(k), v));
            node.setConfig(config); nodes.add(node);
        }
        return nodes;
    }
    private static String text(Map<String, Object> config, String name, String fallback) {
        Object value = config.get(name); return value == null || String.valueOf(value).isBlank() ? fallback : String.valueOf(value).trim();
    }
    private static int bounded(Map<String, Object> config, String name, int fallback, int maximum) {
        try { return Math.min(maximum, Math.max(0, Integer.parseInt(text(config, name, String.valueOf(fallback))))); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException(name + " 必须是整数"); }
    }
    private static boolean stop(Object state, String marker) {
        if (marker.isBlank() || state == null) return false;
        if (state instanceof Map<?, ?> map && map.containsKey(marker)) {
            Object value = map.get(marker);
            return value instanceof Boolean flag ? flag : value instanceof Number number ? number.doubleValue() != 0 : value != null && !String.valueOf(value).isBlank();
        }
        return String.valueOf(state).contains(marker);
    }
    private record BodyResult(Map<String, Object> variables, List<String> waiting, String error) { }
}
