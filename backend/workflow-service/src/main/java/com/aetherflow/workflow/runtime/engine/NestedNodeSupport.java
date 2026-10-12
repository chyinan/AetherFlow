package com.aetherflow.workflow.runtime.engine;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import java.util.*;

/** 从持久化循环作用域解析异步节点，不依赖内存中的循环游标。 */
public final class NestedNodeSupport {
    private NestedNodeSupport() { }
    public static List<String> waitingNodeIds(WorkflowRuntimeSnapshot snapshot) {
        List<String> ids = new ArrayList<>();
        for (String root : snapshot.currentNodeIds()) {
            NodeResult result = snapshot.nodeOutputs().get(root);
            if (result != null && result.output().get("nestedWaiting") instanceof Collection<?> nested)
                nested.forEach(id -> ids.add(String.valueOf(id)));
            else ids.add(root);
        }
        return List.copyOf(ids);
    }
    public static String nodeType(WorkflowRuntimeSnapshot snapshot, String id) {
        Object raw = snapshot.variables().get("__nestedNodeTypes");
        if (raw instanceof Map<?, ?> types && types.get(id) != null) return String.valueOf(types.get(id));
        return snapshot.definition().getNodes().stream().filter(node -> id.equals(node.getNodeId()))
                .map(WorkflowNodeDTO::getNodeType).filter(Objects::nonNull).findFirst().orElse("");
    }
    public static Map<String, Object> variables(WorkflowRuntimeSnapshot snapshot, String id) {
        Object raw = snapshot.variables().get("__nestedContexts");
        if (raw instanceof Map<?, ?> contexts && contexts.get(id) instanceof Map<?, ?> map) return stringMap(map);
        return snapshot.variables();
    }
    public static Map<String, Object> config(WorkflowRuntimeSnapshot snapshot, String id) {
        Object raw = variables(snapshot, id).get(WorkflowNodeContextKeys.NODE_CONFIGS);
        if (raw instanceof Map<?, ?> configs && configs.get(id) instanceof Map<?, ?> map) return stringMap(map);
        return snapshot.definition().getNodes().stream().filter(node -> id.equals(node.getNodeId()))
                .map(WorkflowNodeDTO::getConfig).filter(Objects::nonNull).findFirst().orElse(Map.of());
    }
    private static Map<String, Object> stringMap(Map<?, ?> source) {
        Map<String, Object> result = new LinkedHashMap<>(); source.forEach((k, v) -> result.put(String.valueOf(k), v)); return result;
    }
}
