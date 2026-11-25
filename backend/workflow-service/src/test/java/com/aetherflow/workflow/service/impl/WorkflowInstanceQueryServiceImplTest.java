package com.aetherflow.workflow.service.impl;

// pattern: Imperative Shell

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
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doReturn;
import static org.mockito.ArgumentMatchers.eq;

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
        doReturn(events()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

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
        doReturn(events()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

        RunView detail = asUser(7L, () -> queryService.getInstance(99L));

        assertThat(detail.id()).isEqualTo(99L);
        assertThat(detail.traceId()).isEqualTo("trace-1");
        assertThat(detail.nodes()).hasSize(1);
    }

    @Test
    void workflowCompletionKeepsTheEarlierParallelNodeResult() {
        Instant fastStart = Instant.parse("2026-05-29T01:00:12Z");
        Instant fastEnd = fastStart.plusMillis(250);
        Instant runEnd = fastStart.plusSeconds(12);
        when(instanceMapper.selectById(99L)).thenReturn(instance());

        for (Map<String, Object> summary : List.<Map<String, Object>>of(
                Map.of(), Map.of("resumed", true), Map.of("recovered", true))) {
            doReturn(List.of(
                    timelineEvent(RuntimeEventType.NODE_STARTED, "slow", fastStart.minusSeconds(1), Map.of("nodeType", "WHISPER")),
                    timelineEvent(RuntimeEventType.NODE_STARTED, "fast", fastStart, Map.of("nodeType", "PROMPT")),
                    timelineEvent(RuntimeEventType.NODE_COMPLETED, "fast", fastEnd, Map.of("nodeType", "PROMPT")),
                    timelineEvent(RuntimeEventType.NODE_COMPLETED, "slow", runEnd.minusMillis(1), Map.of("nodeType", "WHISPER")),
                    timelineEvent(RuntimeEventType.WORKFLOW_COMPLETED, "fast", runEnd, summary)
            )).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

            RunView detail = asUser(7L, () -> queryService.getInstance(99L));
            assertThat(detail.status()).isEqualTo("SUCCESS");
            assertThat(detail.nodes()).filteredOn(node -> "fast".equals(node.nodeId())).singleElement().satisfies(node -> {
                assertThat(node.status()).isEqualTo("SUCCESS");
                assertThat(node.latestEventType()).isEqualTo("NODE_COMPLETED");
                assertThat(node.startedAt()).isEqualTo(fastStart);
                assertThat(node.completedAt()).isEqualTo(fastEnd);
                assertThat(node.attributes()).containsExactlyEntriesOf(Map.of("nodeType", "PROMPT"));
            });
            assertThat(asUser(7L, () -> queryService.logs(99L))).anySatisfy(log ->
                    assertThat(log.eventType()).isEqualTo("WORKFLOW_COMPLETED"));
        }
    }

    @Test
    void workflowCancellationKeepsEarlierCompletedNodeResults() {
        Instant start = Instant.parse("2026-05-29T01:00:12Z");
        Instant finished = start.plusMillis(250);
        Instant cancelled = start.plusSeconds(12);
        WorkflowInstance instance = instance();
        instance.setStatus("CANCELLED");
        instance.setCurrentNodeId("fast");
        when(instanceMapper.selectById(99L)).thenReturn(instance);

        for (String result : List.of("SUCCESS", "FAILED")) {
            Map<String, Object> attributes = Map.of("nodeType", "PROMPT", "itemStatus", result, "output", "保留实际结果");
            doReturn(List.of(
                    timelineEvent(RuntimeEventType.NODE_STARTED, "slow", start.minusSeconds(1), Map.of()),
                    timelineEvent(RuntimeEventType.NODE_WAITING, "slow", start.minusMillis(1), Map.of("taskId", "external")),
                    timelineEvent(RuntimeEventType.NODE_STARTED, "fast", start, Map.of("nodeType", "PROMPT")),
                    timelineEvent(RuntimeEventType.NODE_COMPLETED, "fast", finished, attributes),
                    RuntimeEvent.of(RuntimeEventType.WORKFLOW_CANCELLED, "99", "trace-1", "99", "fast",
                            RuntimeState.CANCELLED, cancelled, Map.of("reason", "user_cancelled"))
            )).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

            RunView detail = asUser(7L, () -> queryService.getInstance(99L));
            assertThat(detail.status()).isEqualTo("CANCELLED");
            assertThat(detail.nodes()).filteredOn(node -> "fast".equals(node.nodeId())).singleElement().satisfies(node -> {
                assertThat(node.status()).isEqualTo(result);
                assertThat(node.latestEventType()).isEqualTo("NODE_COMPLETED");
                assertThat(node.startedAt()).isEqualTo(start);
                assertThat(node.completedAt()).isEqualTo(finished);
                assertThat(node.attributes()).containsExactlyEntriesOf(attributes);
            });
            assertThat(detail.nodes()).filteredOn(node -> "slow".equals(node.nodeId())).singleElement().satisfies(node ->
                    assertThat(node.status()).isEqualTo("WAITING"));
            assertThat(asUser(7L, () -> queryService.logs(99L))).anySatisfy(log ->
                    assertThat(log.eventType()).isEqualTo("WORKFLOW_CANCELLED"));
        }
    }

    @Test
    void workflowCancellationStillEndsTheActualWaitingNode() {
        Instant start = Instant.parse("2026-05-29T01:00:12Z");
        Instant cancelled = start.plusSeconds(12);
        WorkflowInstance instance = instance();
        instance.setStatus("CANCELLED");
        instance.setCurrentNodeId("image");
        when(instanceMapper.selectById(99L)).thenReturn(instance);
        doReturn(List.of(
                timelineEvent(RuntimeEventType.NODE_STARTED, "image", start, Map.of("nodeType", "IMAGE_GENERATION")),
                timelineEvent(RuntimeEventType.NODE_WAITING, "image", start.plusMillis(1), Map.of("taskId", "external")),
                RuntimeEvent.of(RuntimeEventType.WORKFLOW_CANCELLED, "99", "trace-1", "99", "image",
                        RuntimeState.CANCELLED, cancelled, Map.of("reason", "user_cancelled"))
        )).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

        assertThat(asUser(7L, () -> queryService.getInstance(99L)).nodes()).singleElement().satisfies(node -> {
            assertThat(node.status()).isEqualTo("CANCELLED");
            assertThat(node.latestEventType()).isEqualTo("WORKFLOW_CANCELLED");
            assertThat(node.completedAt()).isEqualTo(cancelled);
            assertThat(node.attributes()).containsEntry("reason", "user_cancelled");
        });
    }

    @Test
    void workflowCompletionWithMissingNodeEventKeepsStatusWithoutInventingDuration() {
        Instant fastStart = Instant.parse("2026-05-29T01:00:12Z");
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        doReturn(List.of(
                timelineEvent(RuntimeEventType.NODE_STARTED, "fast", fastStart, Map.of("nodeType", "PROMPT")),
                timelineEvent(RuntimeEventType.WORKFLOW_COMPLETED, "fast", fastStart.plusSeconds(12), Map.of("recovered", true))
        )).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());
        assertThat(asUser(7L, () -> queryService.getInstance(99L)).nodes()).singleElement().satisfies(node -> {
            assertThat(node.status()).isEqualTo("SUCCESS");
            assertThat(node.latestEventType()).isEqualTo("WORKFLOW_COMPLETED");
            assertThat(node.completedAt()).isNull();
            assertThat(node.attributes()).isEmpty();
        });
    }

    @Test
    void laterSummaryDoesNotEraseSubstantiveCompletionAttributes() {
        Instant start = Instant.parse("2026-05-29T01:00:12Z");
        Instant end = start.plusMillis(250);
        Map<String, Object> actual = Map.of("resumed", true, "output", "附带实际结果");
        when(instanceMapper.selectById(99L)).thenReturn(instance());
        doReturn(List.of(
                timelineEvent(RuntimeEventType.NODE_STARTED, "fast", start, Map.of("nodeType", "PROMPT")),
                timelineEvent(RuntimeEventType.WORKFLOW_COMPLETED, "fast", end, actual),
                timelineEvent(RuntimeEventType.WORKFLOW_COMPLETED, "fast", end.plusSeconds(12), Map.of())
        )).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());
        assertThat(asUser(7L, () -> queryService.getInstance(99L)).nodes()).singleElement().satisfies(node -> {
            assertThat(node.status()).isEqualTo("SUCCESS");
            assertThat(node.completedAt()).isEqualTo(end);
            assertThat(node.attributes()).containsExactlyEntriesOf(actual);
        });
    }

    private static RuntimeEvent timelineEvent(RuntimeEventType type, String nodeId, Instant at, Map<String, Object> attributes) {
        return RuntimeEvent.of(type, "99", "trace-1", "99", nodeId,
                type == RuntimeEventType.WORKFLOW_COMPLETED ? RuntimeState.SUCCESS : RuntimeState.RUNNING,
                at, attributes);
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
        doReturn(events()).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

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
        doReturn(manyEvents(250)).when(runtimeEventStore).findLatestByWorkflowId(eq("99"), anyInt());

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
