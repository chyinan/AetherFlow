package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.NodeSummary;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.aetherflow.workflow.service.WorkflowInstanceQueryService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class WorkflowInstanceQueryServiceImpl implements WorkflowInstanceQueryService {

    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_LOG_FRAMES = 200;

    private final WorkflowInstanceMapper instanceMapper;
    private final WorkflowDefinitionMapper definitionMapper;
    private final RuntimeEventStore runtimeEventStore;

    @Override
    public RunPageResponse listInstances(String workflowId, String status, int page, int pageSize) {
        int normalizedPage = Math.max(1, page);
        int normalizedPageSize = normalizePageSize(pageSize);
        Long numericWorkflowId = parseWorkflowId(workflowId);
        if (hasText(workflowId) && numericWorkflowId == null) {
            return new RunPageResponse(normalizedPage, normalizedPageSize, 0, List.of());
        }

        LambdaQueryWrapper<WorkflowInstance> countQuery = query(numericWorkflowId, status);
        long total = instanceMapper.selectCount(countQuery);
        if (total == 0) {
            return new RunPageResponse(normalizedPage, normalizedPageSize, 0, List.of());
        }

        long offset = (long) (normalizedPage - 1) * normalizedPageSize;
        LambdaQueryWrapper<WorkflowInstance> listQuery = query(numericWorkflowId, status)
                .orderByDesc(WorkflowInstance::getStartedAt)
                .orderByDesc(WorkflowInstance::getId)
                .last("LIMIT " + offset + ", " + normalizedPageSize);
        List<WorkflowInstance> instances = instanceMapper.selectList(listQuery);
        // Batch-load workflow definitions for the page to avoid an N+1 query
        // (one selectById per instance). 20 rows previously meant 20 extra SQL
        // roundtrips just to resolve the workflow name.
        Map<Long, WorkflowDefinition> definitionById = batchLoadDefinitions(instances);
        List<RunView> items = instances.stream()
                .map(instance -> toRunView(instance,
                        events(instance),
                        resolveDefinitionName(instance.getDefinitionId(), definitionById)))
                .toList();
        return new RunPageResponse(normalizedPage, normalizedPageSize, total, items);
    }

    private Map<Long, WorkflowDefinition> batchLoadDefinitions(List<WorkflowInstance> instances) {
        List<Long> definitionIds = instances.stream()
                .map(WorkflowInstance::getDefinitionId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (definitionIds.isEmpty()) {
            return Map.of();
        }
        List<WorkflowDefinition> definitions = definitionMapper.selectBatchIds(definitionIds);
        return definitions.stream()
                .collect(java.util.stream.Collectors.toMap(
                        WorkflowDefinition::getId,
                        java.util.function.Function.identity(),
                        (a, b) -> a));
    }

    @Override
    public RunView getInstance(Long id) {
        WorkflowInstance instance = existingInstance(id);
        return toRunView(instance, events(instance));
    }

    @Override
    public List<LogFrame> logs(Long id) {
        WorkflowInstance instance = existingInstance(id);
        List<RuntimeEvent> events = events(instance);
        int fromIndex = Math.max(0, events.size() - MAX_LOG_FRAMES);
        return events.subList(fromIndex, events.size()).stream()
                .map(this::toLogFrame)
                .toList();
    }

    private LambdaQueryWrapper<WorkflowInstance> query(Long workflowId, String status) {
        LambdaQueryWrapper<WorkflowInstance> query = new LambdaQueryWrapper<>();
        query.eq(WorkflowInstance::getUserId, currentUserId());
        if (workflowId != null) {
            query.and(wrapper -> wrapper.eq(WorkflowInstance::getDefinitionId, workflowId)
                    .or()
                    .eq(WorkflowInstance::getId, workflowId));
        }
        if (hasText(status)) {
            query.eq(WorkflowInstance::getStatus, status.trim().toUpperCase(Locale.ROOT));
        }
        return query;
    }

    private WorkflowInstance existingInstance(Long id) {
        if (id == null || id <= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow instance id is invalid");
        }
        WorkflowInstance instance = instanceMapper.selectById(id);
        if (instance == null || !owns(instance.getUserId())) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow instance not found");
        }
        return instance;
    }

    private RunView toRunView(WorkflowInstance instance, List<RuntimeEvent> events) {
        return toRunView(instance, events, workflowName(instance.getDefinitionId()));
    }

    private RunView toRunView(WorkflowInstance instance, List<RuntimeEvent> events, String workflowName) {
        return new RunView(
                instance.getId(),
                instance.getDefinitionId(),
                stringify(instance.getDefinitionId()),
                workflowName,
                stringify(instance.getId()),
                instance.getUserId(),
                instance.getStatus(),
                instance.getCurrentNodeId(),
                traceId(events),
                instance.getStartedAt(),
                instance.getCompletedAt(),
                instance.getUpdatedAt(),
                durationMs(instance),
                nodeSummaries(events)
        );
    }

    private String workflowName(Long definitionId) {
        if (definitionId == null) {
            return null;
        }
        WorkflowDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null || !hasText(definition.getName())) {
            return "Workflow Definition " + definitionId;
        }
        return definition.getName();
    }

    private String resolveDefinitionName(Long definitionId, Map<Long, WorkflowDefinition> definitionById) {
        if (definitionId == null) {
            return null;
        }
        WorkflowDefinition definition = definitionById.get(definitionId);
        if (definition == null || !hasText(definition.getName())) {
            return "Workflow Definition " + definitionId;
        }
        return definition.getName();
    }

    private List<RuntimeEvent> events(WorkflowInstance instance) {
        String workflowId = stringify(instance.getId());
        if (workflowId == null || workflowId.isBlank()) {
            return List.of();
        }
        List<RuntimeEvent> events = runtimeEventStore.findByWorkflowId(workflowId);
        return events == null ? List.of() : List.copyOf(events);
    }

    private String traceId(List<RuntimeEvent> events) {
        return events.stream()
                .map(RuntimeEvent::traceId)
                .filter(this::hasText)
                .findFirst()
                .orElse(null);
    }

    private long durationMs(WorkflowInstance instance) {
        LocalDateTime startedAt = instance.getStartedAt();
        if (startedAt == null) {
            return 0;
        }
        LocalDateTime completedAt = instance.getCompletedAt() == null
                ? instance.getUpdatedAt()
                : instance.getCompletedAt();
        if (completedAt == null || completedAt.isBefore(startedAt)) {
            return 0;
        }
        return Duration.between(startedAt, completedAt).toMillis();
    }

    private List<NodeSummary> nodeSummaries(List<RuntimeEvent> events) {
        Map<String, NodeAccumulator> nodes = new LinkedHashMap<>();
        for (RuntimeEvent event : events) {
            if (!hasText(event.nodeId())) {
                continue;
            }
            nodes.computeIfAbsent(event.nodeId(), NodeAccumulator::new).apply(event);
        }
        return nodes.values().stream()
                .map(NodeAccumulator::toSummary)
                .toList();
    }

    private LogFrame toLogFrame(RuntimeEvent event) {
        return new LogFrame(
                event.eventId(),
                event.eventId(),
                level(event),
                message(event),
                event.workflowId(),
                event.traceId(),
                event.taskId(),
                event.nodeId(),
                event.eventType().name(),
                event.runtimeState().name(),
                event.occurredAt(),
                event.attributes()
        );
    }

    private String level(RuntimeEvent event) {
        if (event.eventType() == RuntimeEventType.WORKFLOW_FAILED
                || event.runtimeState() == RuntimeState.FAILED) {
            return "error";
        }
        if (event.eventType() == RuntimeEventType.NODE_RETRYING
                || event.runtimeState() == RuntimeState.RETRYING) {
            return "warn";
        }
        if (event.eventType() == RuntimeEventType.NODE_COMPLETED) {
            return "debug";
        }
        return "info";
    }

    private String message(RuntimeEvent event) {
        return switch (event.eventType()) {
            case WORKFLOW_STARTED -> "Workflow " + event.workflowId() + " started.";
            case NODE_STARTED -> "Runtime started node " + event.nodeId() + ".";
            case NODE_COMPLETED -> "Runtime completed node " + event.nodeId() + ".";
            case NODE_RETRYING -> "Runtime retrying node " + event.nodeId() + ".";
            case WORKFLOW_COMPLETED -> "Workflow " + event.workflowId() + " completed.";
            case WORKFLOW_FAILED -> "Workflow " + event.workflowId() + " failed.";
            case WORKFLOW_CANCELLED -> "Workflow " + event.workflowId() + " cancelled.";
        };
    }

    private Long parseWorkflowId(String workflowId) {
        if (!hasText(workflowId)) {
            return null;
        }
        try {
            return Long.parseLong(workflowId.trim());
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private int normalizePageSize(int pageSize) {
        if (pageSize <= 0) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, MAX_PAGE_SIZE);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String stringify(Long value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Long currentUserId() {
        return AuthenticatedUserContext.requireUserId();
    }

    private static boolean owns(Long userId) {
        return userId != null && userId.equals(currentUserId());
    }

    private static class NodeAccumulator {

        private final String nodeId;
        private String status;
        private String latestEventType;
        private Instant startedAt;
        private Instant completedAt;
        private Map<String, Object> attributes = Map.of();

        private NodeAccumulator(String nodeId) {
            this.nodeId = nodeId;
        }

        private void apply(RuntimeEvent event) {
            latestEventType = event.eventType().name();
            status = nodeStatus(event);
            attributes = event.attributes();
            if (startedAt == null && event.eventType() == RuntimeEventType.NODE_STARTED) {
                startedAt = event.occurredAt();
            }
            if (event.eventType() == RuntimeEventType.NODE_COMPLETED
                    || event.runtimeState() == RuntimeState.SUCCESS
                    || event.runtimeState() == RuntimeState.FAILED
                    || event.runtimeState() == RuntimeState.CANCELLED) {
                completedAt = event.occurredAt();
            }
        }

        private NodeSummary toSummary() {
            return new NodeSummary(nodeId, status, latestEventType, startedAt, completedAt, attributes);
        }

        private String nodeStatus(RuntimeEvent event) {
            if (event.eventType() == RuntimeEventType.NODE_STARTED) {
                return RuntimeState.RUNNING.name();
            }
            if (event.eventType() == RuntimeEventType.NODE_COMPLETED) {
                return RuntimeState.SUCCESS.name();
            }
            if (event.eventType() == RuntimeEventType.NODE_RETRYING) {
                return RuntimeState.RETRYING.name();
            }
            return event.runtimeState().name();
        }
    }
}
