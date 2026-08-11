package com.aetherflow.workflow.runtime.persistence;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
@Slf4j
public class MybatisRuntimeSnapshotRepository implements RuntimeSnapshotRepository {

    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Object>> VARIABLES_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, NodeResult>> NODE_OUTPUTS_TYPE = new TypeReference<>() {
    };

    private final WorkflowRuntimeSnapshotMapper mapper;
    private final ObjectMapper objectMapper;
    private final Object[] saveLocks = createSaveLocks();

    @Override
    public void save(WorkflowRuntimeSnapshot snapshot) {
        if (snapshot == null) {
            return;
        }
        synchronized (saveLock(snapshot.workflowId())) {
            WorkflowRuntimeSnapshotEntity existing = mapper.selectOne(new LambdaQueryWrapper<WorkflowRuntimeSnapshotEntity>()
                    .eq(WorkflowRuntimeSnapshotEntity::getWorkflowId, snapshot.workflowId())
                    .last("LIMIT 1"));
            WorkflowRuntimeSnapshotEntity entity = toEntity(snapshot, existing);
            if (existing == null) {
                mapper.insert(entity);
            } else {
                mapper.updateById(entity);
            }
        }
    }

    private Object saveLock(String workflowId) {
        int hash = workflowId == null ? 0 : workflowId.hashCode();
        return saveLocks[(hash & Integer.MAX_VALUE) % saveLocks.length];
    }

    private static Object[] createSaveLocks() {
        Object[] locks = new Object[64];
        for (int index = 0; index < locks.length; index++) {
            locks[index] = new Object();
        }
        return locks;
    }

    @Override
    public Optional<WorkflowRuntimeSnapshot> findByWorkflowId(String workflowId) {
        WorkflowRuntimeSnapshotEntity entity = mapper.selectOne(new LambdaQueryWrapper<WorkflowRuntimeSnapshotEntity>()
                .eq(WorkflowRuntimeSnapshotEntity::getWorkflowId, workflowId)
                .last("LIMIT 1"));
        return Optional.ofNullable(entity).map(this::toSnapshot);
    }

    @Override
    public List<WorkflowRuntimeSnapshot> findRecoverable(int limit) {
        int maxResults = Math.max(1, limit);
        return readSnapshots(mapper.selectList(new LambdaQueryWrapper<WorkflowRuntimeSnapshotEntity>()
                        .in(WorkflowRuntimeSnapshotEntity::getRuntimeState,
                                RuntimeState.RUNNING.name(),
                                RuntimeState.RETRYING.name())
                        .orderByAsc(WorkflowRuntimeSnapshotEntity::getUpdatedAt)
                        .last("LIMIT " + maxResults)));
    }

    @Override
    public List<WorkflowRuntimeSnapshot> findTerminal(int limit) {
        int maxResults = Math.max(1, limit);
        return readSnapshots(mapper.selectList(new LambdaQueryWrapper<WorkflowRuntimeSnapshotEntity>()
                        .in(WorkflowRuntimeSnapshotEntity::getRuntimeState,
                                RuntimeState.SUCCESS.name(), RuntimeState.FAILED.name(), RuntimeState.CANCELLED.name())
                        .orderByAsc(WorkflowRuntimeSnapshotEntity::getUpdatedAt)
                        .last("LIMIT " + maxResults)));
    }

    private List<WorkflowRuntimeSnapshot> readSnapshots(List<WorkflowRuntimeSnapshotEntity> entities) {
        List<WorkflowRuntimeSnapshot> snapshots = new ArrayList<>();
        if (entities == null) {
            return snapshots;
        }
        for (WorkflowRuntimeSnapshotEntity entity : entities) {
            try {
                snapshots.add(toSnapshot(entity));
            } catch (RuntimeException exception) {
                log.error("skipping malformed workflow runtime snapshot, workflowId={}, reason={}",
                        entity == null ? null : entity.getWorkflowId(), exception.getMessage());
            }
        }
        return List.copyOf(snapshots);
    }

    private WorkflowRuntimeSnapshotEntity toEntity(WorkflowRuntimeSnapshot snapshot,
                                                   WorkflowRuntimeSnapshotEntity existing) {
        LocalDateTime now = LocalDateTime.now();
        WorkflowRuntimeSnapshotEntity entity = new WorkflowRuntimeSnapshotEntity();
        if (existing != null) {
            entity.setId(existing.getId());
            entity.setCreatedAt(existing.getCreatedAt());
        } else {
            entity.setCreatedAt(now);
        }
        entity.setWorkflowId(snapshot.workflowId());
        entity.setTraceId(snapshot.traceId());
        entity.setTaskId(snapshot.taskId());
        entity.setDefinitionId(snapshot.definitionId());
        entity.setDefinitionJson(writeJson(snapshot.definition()));
        entity.setRuntimeState(snapshot.runtimeState().name());
        entity.setCurrentNodeIdsJson(writeJson(snapshot.currentNodeIds()));
        entity.setCompletedNodeIdsJson(writeJson(snapshot.completedNodeIds()));
        entity.setFailedNodeIdsJson(writeJson(snapshot.failedNodeIds()));
        entity.setVariablesJson(writeJson(snapshot.variables()));
        entity.setNodeOutputsJson(writeJson(snapshot.nodeOutputs()));
        entity.setUpdatedAt(now);
        return entity;
    }

    private WorkflowRuntimeSnapshot toSnapshot(WorkflowRuntimeSnapshotEntity entity) {
        return new WorkflowRuntimeSnapshot(
                entity.getWorkflowId(),
                entity.getTraceId(),
                entity.getTaskId(),
                entity.getDefinitionId(),
                readJson(entity.getDefinitionJson(), WorkflowDefinitionDTO.class),
                RuntimeState.valueOf(entity.getRuntimeState()),
                readJson(entity.getCurrentNodeIdsJson(), STRING_LIST_TYPE),
                readJson(entity.getCompletedNodeIdsJson(), STRING_LIST_TYPE),
                readJson(entity.getFailedNodeIdsJson(), STRING_LIST_TYPE),
                readJson(entity.getVariablesJson(), VARIABLES_TYPE),
                readJson(entity.getNodeOutputsJson(), NODE_OUTPUTS_TYPE),
                toInstant(entity.getUpdatedAt())
        );
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("runtime snapshot json serialization failed", exception);
        }
    }

    private <T> T readJson(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("runtime snapshot json deserialization failed", exception);
        }
    }

    private <T> T readJson(String json, TypeReference<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("runtime snapshot json deserialization failed", exception);
        }
    }

    private Instant toInstant(LocalDateTime value) {
        LocalDateTime time = value == null ? LocalDateTime.now() : value;
        return time.atZone(ZoneId.systemDefault()).toInstant();
    }
}
