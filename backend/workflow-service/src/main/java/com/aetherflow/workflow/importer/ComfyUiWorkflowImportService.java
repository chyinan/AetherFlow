package com.aetherflow.workflow.importer;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ComfyUiWorkflowImportService {

    public WorkflowDefinitionDTO importWorkflow(String name,
                                                String description,
                                                Long projectId,
                                                Object workflowJson) {
        Map<String, Object> workflow = objectMap(workflowJson);
        if (workflow.isEmpty()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "comfyui workflow json is required");
        }
        List<ComfyNode> nodes = parseNodes(workflow);
        if (nodes.isEmpty()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "comfyui workflow contains no nodes");
        }
        ImportedImageConfig imported = importedImageConfig(nodes);

        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName(text(name, "Imported ComfyUI Workflow"));
        definition.setDescription(text(description, "Imported from ComfyUI workflow.json"));
        definition.setProjectId(projectId);
        definition.setNodes(List.of(
                node("start", "START", "Start", mapOf("next", "prompt")),
                node("prompt", "PROMPT", "Prompt", mapOf(
                        "prompt", imported.prompt(),
                        "negativePrompt", imported.negativePrompt(),
                        "stylePreset", "comfyui-import"
                )),
                node("image-generation", "IMAGE_GENERATION", "ComfyUI Image Generation", imageConfig(workflow, imported)),
                node("end", "END", "End", Map.of())
        ));
        return definition;
    }

    private Map<String, Object> imageConfig(Map<String, Object> workflow, ImportedImageConfig imported) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("provider", "COMFYUI");
        config.put("mode", "workflow");
        config.put("promptVariable", "prompt");
        config.put("negativePromptVariable", "negativePrompt");
        putIfPresent(config, "seed", imported.seed());
        putIfPresent(config, "steps", imported.steps());
        putIfPresent(config, "cfgScale", imported.cfgScale());
        putIfPresent(config, "sampler", imported.sampler());
        putIfPresent(config, "scheduler", imported.scheduler());
        putIfPresent(config, "width", imported.width());
        putIfPresent(config, "height", imported.height());
        putIfPresent(config, "batchSize", imported.batchSize());
        putIfPresent(config, "denoiseStrength", imported.denoiseStrength());
        putIfPresent(config, "checkpoint", imported.checkpoint());
        putIfPresent(config, "vae", imported.vae());
        if (!imported.lora().isEmpty()) {
            config.put("lora", imported.lora());
        }
        config.put("workflow", workflow);
        config.put("next", "end");
        return config;
    }

    private ImportedImageConfig importedImageConfig(List<ComfyNode> nodes) {
        ComfyNode sampler = firstNode(nodes, "KSampler", "KSamplerAdvanced");
        ComfyNode latent = firstNode(nodes, "EmptyLatentImage", "EmptySD3LatentImage");
        ComfyNode checkpoint = firstNode(nodes, "CheckpointLoaderSimple", "UNETLoader");
        ComfyNode vae = firstNode(nodes, "VAELoader");
        List<ComfyNode> loraNodes = nodes.stream()
                .filter(node -> hasClass(node, "LoraLoader", "LoraLoaderModelOnly"))
                .toList();

        String positivePrompt = promptFromSampler(nodes, sampler, "positive");
        String negativePrompt = promptFromSampler(nodes, sampler, "negative");
        if (positivePrompt.isBlank()) {
            List<String> prompts = nodes.stream()
                    .filter(node -> hasClass(node, "CLIPTextEncode"))
                    .map(node -> string(node.inputs().get("text")))
                    .filter(prompt -> !prompt.isBlank())
                    .toList();
            positivePrompt = prompts.isEmpty() ? "" : prompts.get(0);
            negativePrompt = prompts.size() > 1 ? prompts.get(1) : "";
        }

        return new ImportedImageConfig(
                positivePrompt,
                negativePrompt,
                longValue(input(sampler, "seed")),
                intValue(input(sampler, "steps")),
                doubleValue(firstPresent(input(sampler, "cfg"), input(sampler, "cfg_scale"))),
                string(firstPresent(input(sampler, "sampler_name"), input(sampler, "sampler"))),
                string(input(sampler, "scheduler")),
                intValue(input(latent, "width")),
                intValue(input(latent, "height")),
                intValue(firstPresent(input(latent, "batch_size"), input(latent, "batchSize"))),
                doubleValue(input(sampler, "denoise")),
                string(firstPresent(input(checkpoint, "ckpt_name"), input(checkpoint, "unet_name"))),
                string(input(vae, "vae_name")),
                loraNodes.stream().map(this::loraConfig).filter(map -> !map.isEmpty()).toList()
        );
    }

    private Map<String, Object> loraConfig(ComfyNode node) {
        String name = string(firstPresent(node.inputs().get("lora_name"), node.inputs().get("name")));
        if (name.isBlank()) {
            return Map.of();
        }
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("name", name);
        Double weight = doubleValue(firstPresent(node.inputs().get("strength_model"), node.inputs().get("weight")));
        if (weight != null) {
            config.put("weight", weight);
        }
        return config;
    }

    private String promptFromSampler(List<ComfyNode> nodes, ComfyNode sampler, String inputName) {
        Object reference = input(sampler, inputName);
        if (!(reference instanceof List<?> list) || list.isEmpty()) {
            return "";
        }
        String nodeId = string(list.get(0));
        return nodes.stream()
                .filter(node -> nodeId.equals(node.id()))
                .findFirst()
                .map(node -> string(node.inputs().get("text")))
                .orElse("");
    }

    private List<ComfyNode> parseNodes(Map<String, Object> workflow) {
        Object uiNodes = workflow.get("nodes");
        if (uiNodes instanceof Collection<?> collection) {
            return parseUiNodes(collection);
        }
        List<ComfyNode> nodes = new ArrayList<>();
        for (Map.Entry<String, Object> entry : workflow.entrySet()) {
            Map<String, Object> value = objectMap(entry.getValue());
            String classType = string(value.get("class_type"));
            if (!classType.isBlank()) {
                nodes.add(new ComfyNode(entry.getKey(), classType, objectMap(value.get("inputs"))));
            }
        }
        return nodes.stream().sorted(Comparator.comparing(ComfyNode::id)).toList();
    }

    private List<ComfyNode> parseUiNodes(Collection<?> collection) {
        List<ComfyNode> nodes = new ArrayList<>();
        for (Object item : collection) {
            Map<String, Object> node = objectMap(item);
            String id = string(node.get("id"));
            String classType = string(firstPresent(node.get("type"), node.get("class_type")));
            if (classType.isBlank()) {
                continue;
            }
            Map<String, Object> inputs = objectMap(node.get("inputs"));
            List<Object> widgets = list(node.get("widgets_values"));
            inputs.putAll(widgetInputs(classType, widgets));
            nodes.add(new ComfyNode(id, classType, inputs));
        }
        return nodes;
    }

    private Map<String, Object> widgetInputs(String classType, List<Object> widgets) {
        Map<String, Object> inputs = new LinkedHashMap<>();
        if (widgets.isEmpty()) {
            return inputs;
        }
        switch (classType) {
            case "CLIPTextEncode" -> inputs.put("text", widgets.get(0));
            case "CheckpointLoaderSimple" -> inputs.put("ckpt_name", widgets.get(0));
            case "VAELoader" -> inputs.put("vae_name", widgets.get(0));
            case "LoraLoader", "LoraLoaderModelOnly" -> {
                inputs.put("lora_name", widgets.get(0));
                if (widgets.size() > 1) {
                    inputs.put("strength_model", widgets.get(1));
                }
            }
            case "EmptyLatentImage", "EmptySD3LatentImage" -> {
                if (widgets.size() > 0) {
                    inputs.put("width", widgets.get(0));
                }
                if (widgets.size() > 1) {
                    inputs.put("height", widgets.get(1));
                }
                if (widgets.size() > 2) {
                    inputs.put("batch_size", widgets.get(2));
                }
            }
            case "KSampler", "KSamplerAdvanced" -> {
                putWidget(inputs, widgets, 0, "seed");
                putWidget(inputs, widgets, 1, "steps");
                putWidget(inputs, widgets, 2, "cfg");
                putWidget(inputs, widgets, 3, "sampler_name");
                putWidget(inputs, widgets, 4, "scheduler");
                putWidget(inputs, widgets, 5, "denoise");
            }
            default -> {
            }
        }
        return inputs;
    }

    private static WorkflowNodeDTO node(String nodeId,
                                        String nodeType,
                                        String displayName,
                                        Map<String, Object> config) {
        WorkflowNodeDTO node = new WorkflowNodeDTO();
        node.setNodeId(nodeId);
        node.setNodeType(nodeType);
        node.setDisplayName(displayName);
        node.setConfig(config);
        return node;
    }

    private static ComfyNode firstNode(List<ComfyNode> nodes, String... classTypes) {
        return nodes.stream()
                .filter(node -> hasClass(node, classTypes))
                .findFirst()
                .orElse(null);
    }

    private static boolean hasClass(ComfyNode node, String... classTypes) {
        for (String classType : classTypes) {
            if (node.classType().equals(classType)) {
                return true;
            }
        }
        return false;
    }

    private static Object input(ComfyNode node, String name) {
        return node == null ? null : node.inputs().get(name);
    }

    private static Object firstPresent(Object... values) {
        for (Object value : values) {
            if (value != null && !String.valueOf(value).isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static void putWidget(Map<String, Object> target, List<Object> widgets, int index, String key) {
        if (widgets.size() > index) {
            target.put(key, widgets.get(index));
        }
    }

    private static void putIfPresent(Map<String, Object> target, String key, Object value) {
        if (value != null && !String.valueOf(value).isBlank()) {
            target.put(key, value);
        }
    }

    private static Map<String, Object> objectMap(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return Map.of();
        }
        Map<String, Object> target = new LinkedHashMap<>();
        source.forEach((key, item) -> target.put(String.valueOf(key), item));
        return target;
    }

    private static List<Object> list(Object value) {
        if (!(value instanceof Collection<?> collection)) {
            return List.of();
        }
        return new ArrayList<>(collection);
    }

    private static String string(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static String text(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static Integer intValue(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value)).intValue();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static Long longValue(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value)).longValue();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static Double doubleValue(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value)).doubleValue();
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static Map<String, Object> mapOf(Object... pairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            map.put(String.valueOf(pairs[i]), pairs[i + 1]);
        }
        return map;
    }

    private record ComfyNode(String id, String classType, Map<String, Object> inputs) {
    }

    private record ImportedImageConfig(
            String prompt,
            String negativePrompt,
            Long seed,
            Integer steps,
            Double cfgScale,
            String sampler,
            String scheduler,
            Integer width,
            Integer height,
            Integer batchSize,
            Double denoiseStrength,
            String checkpoint,
            String vae,
            List<Map<String, Object>> lora
    ) {
    }
}
