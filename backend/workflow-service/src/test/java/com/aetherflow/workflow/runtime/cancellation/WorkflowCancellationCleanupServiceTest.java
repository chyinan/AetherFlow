package com.aetherflow.workflow.runtime.cancellation;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkflowCancellationCleanupServiceTest {

    @Test
    void failureSurvivesRefreshAndExplicitRetryCompletesWithoutChangingRunState() {
        WorkflowCancellationCleanupMapper mapper = mock(WorkflowCancellationCleanupMapper.class);
        WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
        TaskClient tasks = mock(TaskClient.class);
        TaskClientProperties properties = mock(TaskClientProperties.class);
        AtomicReference<WorkflowCancellationCleanup> row = new AtomicReference<>(cleanup());
        when(instances.selectById(101L)).thenReturn(instance("CANCELLED"));
        when(properties.issueInternalToken()).thenReturn("internal-token");
        when(mapper.findByWorkflowInstanceId(101L)).thenAnswer(call -> row.get());
        when(mapper.ensurePending(eq(101L), eq(7L), any(LocalDateTime.class))).thenReturn(0);
        when(mapper.selectDue(any(LocalDateTime.class), any(LocalDateTime.class), anyInt()))
                .thenAnswer(call -> WorkflowCancellationCleanup.PENDING.equals(row.get().getStatus())
                        ? List.of(row.get()) : List.of());
        when(mapper.claim(eq(1L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class))).thenAnswer(call -> {
            WorkflowCancellationCleanup current = row.get();
            if (!WorkflowCancellationCleanup.PENDING.equals(current.getStatus())) return 0;
            current.setStatus(WorkflowCancellationCleanup.PROCESSING);
            current.setLeaseToken(call.getArgument(1));
            current.setAttemptCount(current.getAttemptCount() + 1);
            return 1;
        });
        when(mapper.markRetry(eq(1L), anyString(), any(LocalDateTime.class), anyString(), any(LocalDateTime.class)))
                .thenAnswer(call -> {
                    WorkflowCancellationCleanup current = row.get();
                    if (!call.getArgument(1).equals(current.getLeaseToken())) return 0;
                    current.setStatus(WorkflowCancellationCleanup.PENDING);
                    current.setLeaseToken(null);
                    current.setNextAttemptAt(call.getArgument(2));
                    current.setLastError(call.getArgument(3));
                    return 1;
                });
        when(mapper.retryNow(eq(1L), any(LocalDateTime.class))).thenAnswer(call -> {
            row.get().setNextAttemptAt(call.getArgument(1));
            return 1;
        });
        when(mapper.markComplete(eq(1L), anyString(), any(LocalDateTime.class))).thenAnswer(call -> {
            WorkflowCancellationCleanup current = row.get();
            if (!call.getArgument(1).equals(current.getLeaseToken())) return 0;
            current.setStatus(WorkflowCancellationCleanup.COMPLETE);
            current.setLeaseToken(null);
            current.setCompletedAt(call.getArgument(2));
            current.setLastError(null);
            return 1;
        });
        when(tasks.cancelWorkflowTasks("internal-token", 101L))
                .thenThrow(new IllegalStateException("Task Service unavailable"))
                .thenReturn(Result.success(0));
        WorkflowCancellationCleanupService service = new WorkflowCancellationCleanupService(mapper, instances, tasks, properties);

        assertThat(service.dispatchDue()).isZero();
        // A fresh page load reads the persisted error and exposes a retry action.
        assertThat(service.status(101L, 7L)).matches(status ->
                "FAILED".equals(status.status()) && status.retryable()
                        && status.lastError().contains("Task Service unavailable") && status.attemptCount() == 1);

        WorkflowCancellationCleanupStatus retried = service.retry(101L, 7L);

        assertThat(retried).matches(status -> "COMPLETE".equals(status.status()) && !status.retryable()
                && status.lastError() == null && status.attemptCount() == 2);
        assertThat(instances.selectById(101L).getStatus()).isEqualTo("CANCELLED");
        org.mockito.Mockito.verify(tasks, org.mockito.Mockito.times(2)).cancelWorkflowTasks("internal-token", 101L);
    }

    @Test
    void terminalCleanupIsIdempotentAndCompletedRunsCannotRequestCancellationRetry() {
        WorkflowCancellationCleanupMapper mapper = mock(WorkflowCancellationCleanupMapper.class);
        WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
        TaskClient tasks = mock(TaskClient.class);
        TaskClientProperties properties = mock(TaskClientProperties.class);
        WorkflowCancellationCleanup complete = cleanup();
        complete.setStatus(WorkflowCancellationCleanup.COMPLETE);
        complete.setAttemptCount(1);
        when(instances.selectById(101L)).thenReturn(instance("CANCELLED"));
        when(mapper.findByWorkflowInstanceId(101L)).thenReturn(complete);
        WorkflowCancellationCleanupService service = new WorkflowCancellationCleanupService(mapper, instances, tasks, properties);

        assertThat(service.retry(101L, 7L).status()).isEqualTo("COMPLETE");
        assertThat(service.status(101L, 7L).status()).isEqualTo("COMPLETE");
        org.mockito.Mockito.verifyNoInteractions(tasks);

        when(instances.selectById(102L)).thenReturn(instance(102L, "SUCCESS"));
        assertThatThrownBy(() -> service.retry(102L, 7L))
                .isInstanceOf(BusinessException.class).hasMessageContaining("已取消");
    }

    @Test
    void onlyOneReplicaCanClaimAndDispatchTheSameCleanupRow() {
        WorkflowCancellationCleanupMapper mapper = mock(WorkflowCancellationCleanupMapper.class);
        WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
        TaskClient tasks = mock(TaskClient.class);
        TaskClientProperties properties = mock(TaskClientProperties.class);
        WorkflowCancellationCleanup due = cleanup();
        when(mapper.selectDue(any(LocalDateTime.class), any(LocalDateTime.class), anyInt())).thenReturn(List.of(due));
        when(mapper.claim(eq(1L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class))).thenReturn(1, 0);
        when(mapper.markComplete(eq(1L), anyString(), any(LocalDateTime.class))).thenReturn(1);
        when(properties.issueInternalToken()).thenReturn("internal-token");
        when(tasks.cancelWorkflowTasks("internal-token", 101L)).thenReturn(Result.success(0));
        WorkflowCancellationCleanupService replicaA = new WorkflowCancellationCleanupService(mapper, instances, tasks, properties);
        WorkflowCancellationCleanupService replicaB = new WorkflowCancellationCleanupService(mapper, instances, tasks, properties);

        assertThat(replicaA.dispatchDue()).isEqualTo(1);
        assertThat(replicaB.dispatchDue()).isZero();

        org.mockito.Mockito.verify(tasks, org.mockito.Mockito.times(1)).cancelWorkflowTasks("internal-token", 101L);
    }

    private WorkflowCancellationCleanup cleanup() {
        WorkflowCancellationCleanup cleanup = new WorkflowCancellationCleanup();
        cleanup.setId(1L);
        cleanup.setWorkflowInstanceId(101L);
        cleanup.setUserId(7L);
        cleanup.setStatus(WorkflowCancellationCleanup.PENDING);
        cleanup.setAttemptCount(0);
        cleanup.setNextAttemptAt(LocalDateTime.now());
        return cleanup;
    }

    private WorkflowInstance instance(String status) { return instance(101L, status); }

    private WorkflowInstance instance(Long id, String status) {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(id);
        instance.setUserId(7L);
        instance.setStatus(status);
        return instance;
    }
}
