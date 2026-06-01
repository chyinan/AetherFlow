package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.LogFrame;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunPageResponse;
import com.aetherflow.workflow.dto.WorkflowInstanceRunDtos.RunView;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkflowInstanceQueryServiceImplTest {

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
    void listsInstancesWithRuntimeTraceAndNodeSummary() {
        WorkflowInstance instance = instance();
        when(instanceMapper.selectCount(any(Wrapper.class))).thenReturn(1L);
        when(instanceMapper.selectList(any(Wrapper.class))).thenReturn(List.of(instance));
        when(runtimeEventStore.findByWorkflowId("99")).thenReturn(events());

        RunPageResponse response = asUser(7L, () -> queryService.listInstances("10", "success", 1, 20));

        assertThat(response.page()).isEqualTo(1);
        assertThat(response.total()).isEqualTo(1);
        assertThat(response.items()).hasSize(1);
        RunView item = response.items().get(0);
        assertThat(item.id()).isEqualTo(99L);
        assertThat(item.workflowId()).isEqualTo("10");
        assertThat(item.workflowName()).isEqualTo("Workflow Definition 10");
        assertThat(item.runtimeWorkflowId()).isEqualTo("99");
        assertThat(item.traceId()).isEqualTo("trace-1");
        assertThat(item.durationMs()).isEqualTo(60000L);
        assertThat(item.nodes()).extracting("nodeId").containsExactly("node-summary");
        assertThat(item.nodes().get(0).status()).isEqualTo("SUCCESS");
    }

    @Test
    void returnsDetailForExistingInstance() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        when(runtimeEventStore.findByWorkflowId("99")).thenReturn(events());

        RunView detail = asUser(7L, () -> queryService.getInstance(99L));

        assertThat(detail.id()).isEqualTo(99L);
        assertThat(detail.traceId()).isEqualTo("trace-1");
        assertThat(detail.nodes()).hasSize(1);
    }

    @Test
    void detailThrowsWhenInstanceDoesNotExist() {
        when(instanceMapper.selectById(404L)).thenReturn(null);

        assertThatThrownBy(() -> asUser(7L, () -> queryService.getInstance(404L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow instance not found");
    }

    @Test
    void rejectsInstanceOwnedByAnotherUser() {
        WorkflowInstance instance = instance();
        instance.setUserId(99L);
        when(instanceMapper.selectById(99L)).thenReturn(instance);

        assertThatThrownBy(() -> asUser(7L, () -> queryService.getInstance(99L)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("workflow instance not found");
    }

    @Test
    void mapsRuntimeEventsToLogFrames() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        when(runtimeEventStore.findByWorkflowId("99")).thenReturn(events());

        List<LogFrame> logs = asUser(7L, () -> queryService.logs(99L));

        assertThat(logs).hasSize(3);
        assertThat(logs.get(0).level()).isEqualTo("info");
        assertThat(logs.get(1).level()).isEqualTo("info");
        assertThat(logs.get(2).level()).isEqualTo("debug");
        assertThat(logs.get(2).message()).isEqualTo("Runtime completed node node-summary.");
    }

    @Test
    void logsReturnOnlyMostRecentFramesForLongRunningInstances() {
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        when(runtimeEventStore.findByWorkflowId("99")).thenReturn(manyEvents(250));

        List<LogFrame> logs = asUser(7L, () -> queryService.logs(99L));

        assertThat(logs).hasSize(200);
        assertThat(logs.get(0).nodeId()).isEqualTo("node-50");
        assertThat(logs.get(199).nodeId()).isEqualTo("node-249");
    }

    private static WorkflowInstance instance() {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(99L);
        instance.setDefinitionId(10L);
        instance.setUserId(7L);
        instance.setStatus("SUCCESS");
        instance.setCurrentNodeId("node-summary");
        instance.setStartedAt(LocalDateTime.parse("2026-05-29T09:00:00"));
        instance.setCompletedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        instance.setUpdatedAt(LocalDateTime.parse("2026-05-29T09:01:00"));
        return instance;
    }

    private static List<RuntimeEvent> events() {
        return List.of(
                RuntimeEvent.of(RuntimeEventType.WORKFLOW_STARTED, "99", "trace-1", "99", null,
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:00Z"), Map.of("totalNodes", 1)),
                RuntimeEvent.of(RuntimeEventType.NODE_STARTED, "99", "trace-1", "99", "node-summary",
                        RuntimeState.RUNNING, Instant.parse("2026-05-29T01:00:10Z"), Map.of("nodeType", "SUMMARY")),
                RuntimeEvent.of(RuntimeEventType.NODE_COMPLETED, "99", "trace-1", "99", "node-summary",
                        RuntimeState.SUCCESS, Instant.parse("2026-05-29T01:01:00Z"), Map.of("nodeType", "SUMMARY"))
        );
    }

    private static List<RuntimeEvent> manyEvents(int count) {
        return java.util.stream.IntStream.range(0, count)
                .mapToObj(index -> RuntimeEvent.of(
                        RuntimeEventType.NODE_COMPLETED,
                        "99",
                        "trace-1",
                        "99",
                        "node-" + index,
                        RuntimeState.SUCCESS,
                        Instant.parse("2026-05-29T01:00:00Z").plusSeconds(index),
                        Map.of("index", index)))
                .toList();
    }

    private static <T> T asUser(Long userId, Supplier<T> action) {
        return AuthenticatedUserContext.runAs(userId, "aether.operator", action);
    }
}
