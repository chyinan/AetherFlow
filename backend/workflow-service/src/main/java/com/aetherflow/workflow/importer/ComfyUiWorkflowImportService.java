package com.aetherflow.workflow.importer;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.util.ComfyUiWorkflow;
import org.springframework.stereotype.Service;
import java.util.*;
import static com.aetherflow.common.util.ComfyUiWorkflow.map;

@Service
public class ComfyUiWorkflowImportService {
    public WorkflowDefinitionDTO importWorkflow(String name, String description, Long projectId, Object workflowJson) {
        Map<String, Object> graph;
        try { graph = ComfyUiWorkflow.decodeGraph(workflowJson); }
        catch (IllegalArgumentException exception) { throw new BusinessException(ResultCode.BAD_REQUEST, exception.getMessage()); }
        ComfyUiWorkflow.Format format = ComfyUiWorkflow.format(graph);
        if (format == ComfyUiWorkflow.Format.INVALID)
            throw new BusinessException(ResultCode.BAD_REQUEST, "无法识别 ComfyUI 图：请选择普通界面 JSON 或 API 格式 JSON，不能混合两种结构");
        Map<String, Map<String, Object>> nodes = summaryNodes(graph, format);
        String positive = prompt(nodes, "positive"), negative = prompt(nodes, "negative");
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("format", format.name()); metadata.put("nodeCount", nodes.size());
        metadata.put("positiveStatus", positive == null ? "unresolved" : "resolved");
        metadata.put("negativeStatus", negative == null ? "unresolved" : "resolved");
        metadata.put("pluginStatus", "unverified");
        Map<String, Object> image = new LinkedHashMap<>();
        image.put("provider", "COMFYUI"); image.put("mode", "workflow");
        image.put("promptVariable", "prompt"); image.put("negativePromptVariable", "negativePrompt");
        // 原始图独立保留；执行图可由用户明确替换为原生前端导出的 API 图。
        image.put("workflow", graph); image.put("workflowJson", graph);
        image.put("workflowBindings", List.of()); image.put("comfyImport", metadata); image.put("next", "end");
        WorkflowDefinitionDTO result = new WorkflowDefinitionDTO();
        result.setName(name == null || name.isBlank() ? "Imported ComfyUI Workflow" : name);
        result.setDescription(description == null || description.isBlank() ? "4 个 AF 节点封装原始 ComfyUI 图；插件与模型尚未验证" : description);
        result.setProjectId(projectId);
        result.setNodes(List.of(node("start", "START", "Start", Map.of("next", "prompt")),
                node("prompt", "PROMPT", "Prompt", Map.of("prompt", positive == null ? "" : positive,
                        "negativePrompt", negative == null ? "" : negative, "stylePreset", "comfyui-import", "next", "image-generation")),
                node("image-generation", "IMAGE_GENERATION", "ComfyUI · " + nodes.size() + " nodes · " + format.name(), image),
                node("end", "END", "End", Map.of())));
        return result;
    }
    /** 仅为摘要构建输入引用；不把 UI widget 编译成可执行 API 图。 */
    private Map<String, Map<String, Object>> summaryNodes(Map<String, Object> graph, ComfyUiWorkflow.Format format) {
        Map<String, Map<String, Object>> result = new LinkedHashMap<>();
        if (format == ComfyUiWorkflow.Format.API) { graph.forEach((id, value) -> result.put(id, map(value))); return result; }
        Map<Object, List<?>> links = new HashMap<>();
        if (graph.get("links") instanceof List<?> values) for (Object value : values)
            if (value instanceof List<?> link && link.size() >= 5) links.put(link.get(0), link);
        for (Object value : (List<?>)graph.get("nodes")) {
            Map<String, Object> source = map(value), inputs = new LinkedHashMap<>();
            if (source.get("inputs") instanceof List<?> values) for (Object input : values) {
                Map<String, Object> field = map(input);
                List<?> link = links.get(field.get("link"));
                if (link != null) inputs.put(String.valueOf(field.get("name")), List.of(String.valueOf(link.get(1)), link.get(2)));
                else if (field.get("link") != null) inputs.put(String.valueOf(field.get("name")), Map.of("unresolvedLink", field.get("link")));
            }
            Object type = source.get("type");
            if (source.get("widgets_values") instanceof List<?> widgets && !widgets.isEmpty()) {
                if ("CLIPTextEncode".equals(type)) inputs.putIfAbsent("text", widgets.get(0));
                if ("PrimitiveString".equals(type)) inputs.putIfAbsent("value", widgets.get(0));
            }
            result.put(String.valueOf(source.get("id")), Map.of("class_type", type, "inputs", inputs));
        }
        return result;
    }
    private String prompt(Map<String, Map<String, Object>> nodes, String direction) {
        Set<String> texts = new HashSet<>();
        for (Map<String, Object> node : nodes.values()) {
            if (!Set.of("KSampler", "KSamplerAdvanced").contains(node.get("class_type"))) continue;
            Object input = map(node.get("inputs")).get(direction);
            if (!(input instanceof List<?> link) || link.size() != 2 || !Integer.valueOf(0).equals(link.get(1))) return null;
            Map<String, Object> encoder = nodes.get(String.valueOf(link.get(0)));
            if (encoder == null || !"CLIPTextEncode".equals(encoder.get("class_type"))) return null;
            String text = staticText(map(encoder.get("inputs")).get("text"), nodes, new HashSet<>());
            if (text == null) return null;
            texts.add(text);
        }
        return texts.size() == 1 ? texts.iterator().next() : null;
    }
    private String staticText(Object value, Map<String, Map<String, Object>> nodes, Set<String> seen) {
        if (value instanceof String text) return text;
        if (value instanceof List<?> link && link.size() == 2 && Integer.valueOf(0).equals(link.get(1))) {
            String id = String.valueOf(link.get(0));
            if (!seen.add(id)) return null;
            Map<String, Object> source = nodes.get(id);
            // 插件文本由原生 ComfyUI 求值，不猜测 widget 顺序或拼接语义。
            if (source != null && "PrimitiveString".equals(source.get("class_type")))
                return staticText(map(source.get("inputs")).get("value"), nodes, seen);
        }
        return null;
    }
    private WorkflowNodeDTO node(String id, String type, String title, Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(id); node.setNodeType(type); node.setDisplayName(title); node.setConfig(config); return node;
    }
}
