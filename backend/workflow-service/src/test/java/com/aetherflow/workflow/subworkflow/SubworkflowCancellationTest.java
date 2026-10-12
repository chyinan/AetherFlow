package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.cancellation.WorkflowCancellationService;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 使用真实取消服务、扫描器和内存快照，持久层模拟执行正常的条件更新。 */
class SubworkflowCancellationTest {
    private final WorkflowChildRunMapper calls = mock(WorkflowChildRunMapper.class);
    private final WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
    private final WorkflowRuntimeSnapshotMapper snapshotMapper = mock(WorkflowRuntimeSnapshotMapper.class);
    private final InMemoryRuntimeSnapshotRepository snapshots = new InMemoryRuntimeSnapshotRepository();
    private final TaskClient tasks = mock(TaskClient.class);
    private final TaskClientProperties taskProperties = mock(TaskClientProperties.class);
    private final WorkflowTerminalNotificationOutboxService notifications = mock(WorkflowTerminalNotificationOutboxService.class);
    private final WorkflowInstance parent = instance(1L, "CANCELLED");
    private final WorkflowInstance child = instance(2L, "WAITING");
    private final WorkflowChildRun run = new WorkflowChildRun();

    @BeforeEach
    void setup() {
        run.setId(3L); run.setParentInstanceId(1L); run.setChildInstanceId(2L);
        run.setOwnerUserId(7L); run.setParentNodeId("call"); run.setStatus("WAITING");
        when(instances.selectById(1L)).thenReturn(parent);
        when(instances.selectById(2L)).thenReturn(child);
        when(calls.due(any(), anyInt())).thenAnswer(invocation -> "WAITING".equals(run.getStatus()) ? List.of(run) : List.of());
        when(calls.recordAttempt(eq(3L), anyString(), any(), any())).thenAnswer(invocation -> {
            run.setStatus(invocation.getArgument(1)); return 1;
        });
        when(instances.cancelIfActive(eq(2L), eq(7L), any())).thenAnswer(invocation -> {
            String snapshotState = snapshots.findByWorkflowId("2").map(s -> s.runtimeState().name()).orElse("");
            if (List.of("SUCCESS", "FAILED", "CANCELLED").contains(child.getStatus())
                    || List.of("SUCCESS", "FAILED").contains(snapshotState)) return 0;
            child.setStatus("CANCELLED");
            if (snapshots.findByWorkflowId("2").isPresent()) saveChild(RuntimeState.CANCELLED);
            return snapshots.findByWorkflowId("2").isPresent() ? 2 : 1;
        });
        when(snapshotMapper.markCancelled("2")).thenAnswer(invocation -> {
            if (snapshots.findByWorkflowId("2").isEmpty()
                    || List.of(RuntimeState.SUCCESS, RuntimeState.FAILED, RuntimeState.CANCELLED)
                    .contains(snapshots.findByWorkflowId("2").orElseThrow().runtimeState())) return 0;
            saveChild(RuntimeState.CANCELLED); return 1;
        });
        when(taskProperties.issueInternalToken()).thenReturn("test-token");
        when(tasks.cancelWorkflowTasks("test-token", 2L)).thenReturn(Result.success(0));
    }

    @Test
    void cancelsWaitingChildSnapshotAndTasksBeforeCompletingReceipt() {
        saveChild(RuntimeState.WAITING);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("CANCELLED");
        assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(RuntimeState.CANCELLED);
        assertThat(run.getStatus()).isEqualTo("COMPLETED");
        var order = inOrder(instances, snapshotMapper, tasks, notifications, calls);
        order.verify(instances).cancelIfActive(eq(2L), eq(7L), any());
        order.verify(snapshotMapper).markCancelled("2");
        order.verify(tasks).cancelWorkflowTasks("test-token", 2L);
        order.verify(notifications).enqueue(2L, 7L, null, RuntimeState.CANCELLED, null);
        order.verify(calls).recordAttempt(eq(3L), eq("COMPLETED"), any(), any());
    }

    @Test
    void pendingChildWithoutSnapshotStillCancelsTasks() {
        child.setStatus("PENDING");
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("CANCELLED");
        verify(tasks).cancelWorkflowTasks("test-token", 2L);
    }

    @Test
    void taskExceptionRetainsReceiptAndFreshScannerRetriesCancelledChild() {
        saveChild(RuntimeState.WAITING);
        when(tasks.cancelWorkflowTasks("test-token", 2L))
                .thenThrow(new IllegalStateException("暂时断开"))
                .thenReturn(Result.success(2));
        assertRetryThenComplete();
    }

    @ParameterizedTest
    @MethodSource("unsuccessfulCleanupResults")
    void unconfirmedTaskResponseRetainsReceiptUntilRetrySucceeds(Result<Integer> response) {
        saveChild(RuntimeState.WAITING);
        when(tasks.cancelWorkflowTasks("test-token", 2L)).thenReturn(response, Result.success(0));
        assertRetryThenComplete();
    }

    static Stream<Result<Integer>> unsuccessfulCleanupResults() {
        return Stream.of(null, Result.fail(ResultCode.SERVICE_UNAVAILABLE), Result.success(null), Result.success(-1));
    }

    @Test
    void alreadyCancelledChildSnapshotDoesNotSkipTaskCleanup() {
        child.setStatus("CANCELLED"); saveChild(RuntimeState.CANCELLED);
        assertThat(recovery().reconcile()).isEqualTo(1);
        verify(tasks).cancelWorkflowTasks("test-token", 2L);
        verify(instances, never()).cancelIfActive(anyLong(), anyLong(), any());
    }

    @Test
    void snapshotWriteFailureRetainsReceiptForRetry() {
        saveChild(RuntimeState.WAITING);
        when(snapshotMapper.markCancelled("2")).thenThrow(new IllegalStateException("暂时写失败"))
                .thenAnswer(invocation -> { saveChild(RuntimeState.CANCELLED); return 1; });
        assertThat(recovery().reconcile()).isZero();
        assertThat(run.getStatus()).isEqualTo("WAITING");
        verifyNoInteractions(tasks);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(RuntimeState.CANCELLED);
    }

    @ParameterizedTest
    @MethodSource("completedStates")
    void completedChildSnapshotIsPreservedBeforeInstanceProjection(RuntimeState state) {
        saveChild(state);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("WAITING");
        assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(state);
        verifyNoInteractions(snapshotMapper, tasks, notifications);
        verify(instances, never()).cancelIfActive(anyLong(), anyLong(), any());
    }

    static Stream<RuntimeState> completedStates() { return Stream.of(RuntimeState.SUCCESS, RuntimeState.FAILED); }

    @Test
    void completionBetweenReadAndConditionalUpdateIsPreserved() {
        saveChild(RuntimeState.WAITING);
        when(instances.cancelIfActive(eq(2L), eq(7L), any())).thenAnswer(invocation -> {
            saveChild(RuntimeState.SUCCESS); return 0;
        });
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("WAITING");
        assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        verifyNoInteractions(snapshotMapper, tasks, notifications);
    }

    @Test
    void completedInstanceWithStaleSnapshotIsPreserved() {
        child.setStatus("SUCCESS"); saveChild(RuntimeState.WAITING);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("SUCCESS");
        verifyNoInteractions(snapshotMapper, tasks, notifications);
    }

    @Test
    void successfulParentNeverCancelsChild() {
        parent.setStatus("SUCCESS"); saveChild(RuntimeState.WAITING);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("WAITING");
        verifyNoInteractions(snapshotMapper, tasks, notifications);
    }

    @Test
    void cancelledSnapshotWithActiveInstanceCanStillBeReconciled() {
        saveChild(RuntimeState.CANCELLED);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(child.getStatus()).isEqualTo("CANCELLED");
        verify(tasks).cancelWorkflowTasks("test-token", 2L);
    }

    @Test
    void directServiceCallerCanRetryAfterTaskCleanupFailure() {
        saveChild(RuntimeState.WAITING);
        when(tasks.cancelWorkflowTasks("test-token", 2L))
                .thenThrow(new IllegalStateException("暂时断开")).thenReturn(Result.success(0));
        assertThatThrownBy(() -> cancellation().cancel(2L, 7L)).isInstanceOf(IllegalStateException.class);
        assertThat(child.getStatus()).isEqualTo("CANCELLED");
        assertThat(cancellation().cancel(2L, 7L)).isTrue();
        verify(instances, times(1)).cancelIfActive(eq(2L), eq(7L), any());
        verify(tasks, times(2)).cancelWorkflowTasks("test-token", 2L);
    }

    @Test
    void sqlCancelsInstanceAndSnapshotAtomicallyWithoutOverwritingCompletedSnapshot() throws Exception {
        String instanceSql = String.join(" ", WorkflowInstanceMapper.class
                .getMethod("cancelIfActive", Long.class, Long.class, java.time.LocalDateTime.class)
                .getAnnotation(org.apache.ibatis.annotations.Update.class).value());
        assertThat(instanceSql).contains("LEFT JOIN af_workflow_runtime_snapshot", "s.runtime_state = 'CANCELLED'",
                "s.runtime_state NOT IN ('SUCCESS', 'FAILED')");
        String snapshotSql = String.join(" ", WorkflowRuntimeSnapshotMapper.class.getMethod("markCancelled", String.class)
                .getAnnotation(org.apache.ibatis.annotations.Update.class).value());
        assertThat(snapshotSql).contains("runtime_state NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')");
    }

    private void assertRetryThenComplete() {
        assertThat(recovery().reconcile()).isZero();
        assertThat(run.getStatus()).isEqualTo("WAITING");
        assertThat(child.getStatus()).isEqualTo("CANCELLED");
        assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(RuntimeState.CANCELLED);
        verifyNoInteractions(notifications);
        assertThat(recovery().reconcile()).isEqualTo(1);
        assertThat(run.getStatus()).isEqualTo("COMPLETED");
        assertThat(recovery().reconcile()).isZero();
        verify(instances, times(1)).cancelIfActive(eq(2L), eq(7L), any());
        verify(tasks, times(2)).cancelWorkflowTasks("test-token", 2L);
    }

    private SubworkflowRecoveryJob recovery() {
        return new SubworkflowRecoveryJob(calls, instances, snapshots, mock(SubworkflowService.class),
                mock(WorkflowRuntimeEngine.class), new WorkflowRuntimeProperties(), cancellation());
    }

    private WorkflowCancellationService cancellation() {
        return new WorkflowCancellationService(instances, snapshotMapper, snapshots, tasks, taskProperties, notifications);
    }

    private void saveChild(RuntimeState state) {
        snapshots.save(new WorkflowRuntimeSnapshot("2", "trace", "2", 10L, new WorkflowDefinitionDTO(),
                state, List.of(), List.of(), List.of(), Map.of(), Map.of(), Instant.now()));
    }

    private static WorkflowInstance instance(long id, String state) {
        var instance = new WorkflowInstance(); instance.setId(id); instance.setUserId(7L); instance.setStatus(state); return instance;
    }
}
