package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.runtime.dag.WorkflowDag;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WorkflowVersionService {
    private final WorkflowDefinitionVersionMapper mapper;
    private final ObjectMapper objectMapper;

    public void capture(WorkflowDefinition definition) {
        WorkflowDefinitionVersion version = new WorkflowDefinitionVersion();
        version.setDefinitionId(definition.getId());
        version.setVersion(definition.getVersion() == null ? 1 : definition.getVersion());
        version.setOwnerUserId(definition.getOwnerUserId());
        version.setDefinitionJson(definition.getDefinitionJson());
        version.setCreatedAt(LocalDateTime.now());
        mapper.insertImmutable(version);
    }

    public WorkflowDefinitionVersion require(long definitionId, int version) {
        WorkflowDefinitionVersion snapshot = mapper.findOwned(definitionId, version,
                AuthenticatedUserContext.requireUserId());
        if (snapshot == null) throw new BusinessException(ResultCode.NOT_FOUND, "workflow version not found");
        return snapshot;
    }

    public List<WorkflowDefinitionVersion> list(long definitionId) {
        return mapper.listOwned(definitionId, AuthenticatedUserContext.requireUserId());
    }

    public WorkflowDefinitionDTO read(WorkflowDefinitionVersion version) {
        try {
            return objectMapper.readValue(version.getDefinitionJson(), WorkflowDefinitionDTO.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("workflow version JSON is invalid", exception);
        }
    }

    /** 按不可变的 (definitionId, version) 检查调用依赖，普通 DAG 环仍由 WorkflowDag 校验。 */
    public List<WorkflowDefinitionDTO> dependencies(WorkflowDefinitionDTO root) {
        List<WorkflowDefinitionDTO> result = new ArrayList<>();
        visit(root, new LinkedHashSet<>(), new LinkedHashSet<>(), result, 0);
        return List.copyOf(result);
    }

    private void visit(WorkflowDefinitionDTO definition, Set<String> active, Set<String> visited,
                       List<WorkflowDefinitionDTO> result, int depth) {
        if (depth > 16) throw new IllegalArgumentException("subworkflow nesting exceeds 16 levels");
        WorkflowDag.from(definition);
        for (WorkflowNodeDTO node : definition.getNodes()) {
            Map<String, Object> config = node.getConfig() == null ? Map.of() : node.getConfig();
            if ("SUBWORKFLOW".equalsIgnoreCase(node.getNodeType())) {
                SubworkflowConfig reference = SubworkflowConfig.from(config);
                String key = reference.definitionId() + ":" + reference.definitionVersion();
                if (active.contains(key)) throw new IllegalArgumentException("subworkflow call contains cycle: " + key);
                if (visited.contains(key)) continue;
                if (visited.size() >= 256) throw new IllegalArgumentException("too many subworkflow dependencies");
                active.add(key);
                WorkflowDefinitionDTO child = read(require(reference.definitionId(), reference.definitionVersion()));
                visit(child, active, visited, result, depth + 1);
                active.remove(key);
                visited.add(key);
                result.add(child);
            }
            if (("LOOP".equalsIgnoreCase(node.getNodeType()) || "ITERATION".equalsIgnoreCase(node.getNodeType()))
                    && config.get("bodyNodes") instanceof List<?> bodyNodes && !bodyNodes.isEmpty()) {
                WorkflowDefinitionDTO body = new WorkflowDefinitionDTO();
                body.setNodes(bodyNodes.stream().map(raw -> objectMapper.convertValue(raw, WorkflowNodeDTO.class)).toList());
                visit(body, active, visited, result, depth + 1);
                result.add(body);
            }
        }
    }
}
