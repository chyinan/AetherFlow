package com.aetherflow.workflow.service.impl;

// pattern: Imperative Shell

import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;

/**
 * 冷加载历史运行时，循环子节点的失败必须仍然是失败，不能被当成成功。
 */
@ExtendWith(MockitoExtension.class)
class WorkflowInstanceQueryNestedFailureStatusTest {

    @Mock
    private WorkflowInstanceMapper instanceMapper;

    @Mock
    private WorkflowDefinitionMapper definitionMapper;

    @Mock
    private RuntimeEventStore runtimeEventStore;

    private WorkflowInstanceQueryServiceImpl queryService;

    @BeforeEach
    void setUp() {
        queryService = new WorkflowInstanceQueryServiceImpl(instanceMapper, definitionMapper, runtimeEventStore);
    }

    @Test
    void nestedFailedStepStaysFailedWhenHistoryIsLoadedCold() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        doReturn(nestedFailureEvents()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

        RunView detail = asUser(7L, () -> queryService.getInstance(99L));

        assertThat(detail.nodes()).extracting("nodeId").contains("loop/iteration-0/step");
        assertThat(detail.nodes()).filteredOn(node -> "loop/iteration-0/step".equals(node.nodeId()))
                .extracting("status").containsExactly("FAILED");
    }

    @Test
    void nestedSuccessfulStepStaysSuccessful() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        doReturn(nestedSuccessEvents()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

        RunView detail = asUser(7L, () -> queryService.getInstance(99L));

        assertThat(detail.nodes()).filteredOn(node -> "loop/iteration-0/step".equals(node.nodeId()))
                .extracting("status").containsExactly("SUCCESS");
    }

    @Test
    void ordinaryCompletedNodeStaysSuccessful() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        doReturn(ordinaryEvents()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

        RunView detail = asUser(7L, () -> queryService.getInstance(99L));

        assertThat(detail.nodes()).filteredOn(node -> "summary".equals(node.nodeId()))
                .extracting("status").containsExactly("SUCCESS");
    }

    private static WorkflowInstance instance() {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(99L);
        instance.setDefinitionId(10L);
        instance.setUserId(7L);
        instance.setStatus("FAILED");
        instance.setCurrentNodeId("loop/iteration-0/step");
        instance.setStartedAt(LocalDateTime.parse("2026-05-29T09:00:00"));
        instance.setCompletedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        instance.setUpdatedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        return instance;
    }

    /** 循环子节点失败：事件仍是 NODE_COMPLETED，真实状态由 itemStatus 携带。 */
    private static List<RuntimeEvent> nestedFailureEvents() {
        return List.of(
                RuntimeEvent.of(RuntimeEventType.NODE_STARTED, "99", "trace-1", "99", "loop/iteration-0/step",
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:10Z"),
                        Map.of("nodeType", "SUMMARY", "nested", true)),
                RuntimeEvent.of(RuntimeEventType.NODE_COMPLETED, "99", "trace-1", "99", "loop/iteration-0/step",
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:50Z"),
                        Map.of("nodeType", "SUMMARY", "nested", true, "itemStatus", "FAILED")));
    }

    private static List<RuntimeEvent> nestedSuccessEvents() {
        return List.of(
                RuntimeEvent.of(RuntimeEventType.NODE_STARTED, "99", "trace-1", "99", "loop/iteration-0/step",
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:10Z"),
                        Map.of("nodeType", "SUMMARY", "nested", true)),
                RuntimeEvent.of(RuntimeEventType.NODE_COMPLETED, "99", "trace-1", "99", "loop/iteration-0/step",
                        RuntimeState.SUCCESS, Instant.parse("2026-05-29T01:00:50Z"),
                        Map.of("nodeType", "SUMMARY", "nested", true, "itemStatus", "SUCCESS")));
    }

    private static List<RuntimeEvent> ordinaryEvents() {
        return List.of(
                RuntimeEvent.of(RuntimeEventType.NODE_STARTED, "99", "trace-1", "99", "summary",
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:10Z"), Map.of("nodeType", "SUMMARY")),
                RuntimeEvent.of(RuntimeEventType.NODE_COMPLETED, "99", "trace-1", "99", "summary",
                        RuntimeState.SUCCESS, Instant.parse("2026-05-29T01:01:00Z"), Map.of("nodeType", "SUMMARY")));
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
