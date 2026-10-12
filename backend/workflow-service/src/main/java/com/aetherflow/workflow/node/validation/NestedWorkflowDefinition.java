package com.aetherflow.workflow.node.validation;

import com.aetherflow.common.dto.WorkflowNodeDTO;
import java.util.*;

/** 保存与启动时统一检查循环体，沿用普通节点的目录和能力校验。 */
public final class NestedWorkflowDefinition {
    private NestedWorkflowDefinition() { }
    public static List<WorkflowNodeDTO> flatten(List<WorkflowNodeDTO> nodes) {
        List<WorkflowNodeDTO> result = new ArrayList<>();
        visit(nodes == null ? List.of() : nodes, result, 0);
        return result;
    }
    private static void visit(List<WorkflowNodeDTO> nodes, List<WorkflowNodeDTO> result, int depth) {
        if (depth > 8) throw new IllegalArgumentException("循环体嵌套最多 8 层");
        for (WorkflowNodeDTO node : nodes) {
            if (node == null) continue;
            result.add(node);
            if (!("ITERATION".equalsIgnoreCase(node.getNodeType()) || "LOOP".equalsIgnoreCase(node.getNodeType()))) continue;
            Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
            if (config.get("bodyNodes") == null) continue;
            if (!(config.get("bodyNodes") instanceof Collection<?> entries) || entries.size() > 100)
                throw new IllegalArgumentException("循环体必须是最多 100 个节点的数组");
            List<WorkflowNodeDTO> children = new ArrayList<>(); Set<String> ids = new HashSet<>();
            for (Object entry : entries) {
                if (!(entry instanceof Map<?, ?> item)) throw new IllegalArgumentException("循环体节点必须是对象");
                String localId = item.get("nodeId") == null ? "" : String.valueOf(item.get("nodeId"));
                if (localId.isBlank() || localId.contains("/") || !ids.add(localId)) throw new IllegalArgumentException("循环体节点 ID 必须唯一且不能包含斜线");
                String id = node.getNodeId() + "/iteration-999/" + localId;
                if (id.length() > 128) throw new IllegalArgumentException("循环体节点作用域 ID 超过 128 字符");
                WorkflowNodeDTO child = new WorkflowNodeDTO(); child.setNodeId(id);
                child.setNodeType(item.get("nodeType") == null ? "" : String.valueOf(item.get("nodeType")));
                if (child.getNodeType().isBlank()) throw new IllegalArgumentException("循环体节点类型不能为空");
                Map<String, Object> values = new LinkedHashMap<>();
                if (item.get("config") instanceof Map<?, ?> map) map.forEach((k, v) -> values.put(String.valueOf(k), v));
                else if (item.get("config") != null) throw new IllegalArgumentException("循环体配置必须是对象");
                if (Set.of("START", "END", "CONDITION", "QUESTION_CLASSIFIER").contains(child.getNodeType().toUpperCase(Locale.ROOT))
                        || "BRANCH".equalsIgnoreCase(String.valueOf(values.get("errorStrategy")))
                        || "BRANCH".equalsIgnoreCase(String.valueOf(values.get("rejectBehavior"))))
                    throw new IllegalArgumentException("顺序循环体不支持分支路由，请将分支放入子工作流");
                child.setConfig(values); children.add(child);
            }
            visit(children, result, depth + 1);
        }
    }
}
