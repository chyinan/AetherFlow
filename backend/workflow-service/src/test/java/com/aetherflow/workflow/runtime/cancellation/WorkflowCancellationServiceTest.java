package com.aetherflow.workflow.runtime.cancellation;

import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.notification.WorkflowTerminalNotificationOutboxService;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

class WorkflowCancellationServiceTest {

    @Test
    void commitsCancelledStateAndCleanupReceiptIdempotentlyBeforeExternalCleanup() {
        WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
        WorkflowRuntimeSnapshotMapper snapshotsMapper = mock(WorkflowRuntimeSnapshotMapper.class);
        RuntimeSnapshotRepository snapshots = mock(RuntimeSnapshotRepository.class);
        WorkflowCancellationCleanupMapper cleanups = mock(WorkflowCancellationCleanupMapper.class);
        WorkflowTerminalNotificationOutboxService notifications = mock(WorkflowTerminalNotificationOutboxService.class);
        WorkflowInstance instance = instance("RUNNING");
        when(instances.selectById(101L)).thenReturn(instance);
        when(snapshots.findByWorkflowId("101")).thenReturn(Optional.empty());
        doAnswer(invocation -> { instance.setStatus("CANCELLED"); return 1; })
                .when(instances).cancelIfActive(eq(101L), eq(7L), any(LocalDateTime.class));
        when(cleanups.findByWorkflowInstanceId(101L)).thenReturn(cleanup());
        WorkflowCancellationService service = new WorkflowCancellationService(
                instances, snapshotsMapper, snapshots, cleanups, notifications);

        assertThat(service.cancel(101L, 7L)).isTrue();
        assertThat(service.cancel(101L, 7L)).isTrue();

        verify(instances).cancelIfActive(eq(101L), eq(7L), any(LocalDateTime.class));
        verify(snapshotsMapper, org.mockito.Mockito.times(2)).markCancelled("101");
        verify(cleanups, org.mockito.Mockito.times(2)).ensurePending(eq(101L), eq(7L), any(LocalDateTime.class));
        verify(notifications, org.mockito.Mockito.times(2))
                .enqueue(101L, 7L, null, RuntimeState.CANCELLED, null);
    }

    @Test
    void completedRunsNeverCreateCancellationCleanupWork() {
        WorkflowInstanceMapper instances = mock(WorkflowInstanceMapper.class);
        WorkflowRuntimeSnapshotMapper snapshotsMapper = mock(WorkflowRuntimeSnapshotMapper.class);
        RuntimeSnapshotRepository snapshots = mock(RuntimeSnapshotRepository.class);
        WorkflowCancellationCleanupMapper cleanups = mock(WorkflowCancellationCleanupMapper.class);
        WorkflowTerminalNotificationOutboxService notifications = mock(WorkflowTerminalNotificationOutboxService.class);
        when(instances.selectById(101L)).thenReturn(instance("SUCCESS"));
        WorkflowCancellationService service = new WorkflowCancellationService(
                instances, snapshotsMapper, snapshots, cleanups, notifications);

        assertThat(service.cancel(101L, 7L)).isFalse();

        verify(cleanups, never()).ensurePending(any(), any(), any());
        verify(notifications, never()).enqueue(any(), any(), any(), any(), any());
        verify(snapshotsMapper, never()).markCancelled(any());
    }

    @Test
    void cancellationStateAndCleanupReceiptAreCommittedInOneTransaction() throws Exception {
        assertThat(WorkflowCancellationService.class.getMethod("cancel", Long.class, Long.class)
                .getAnnotation(Transactional.class)).isNotNull();
    }

    private WorkflowInstance instance(String status) {
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(101L);
        instance.setUserId(7L);
        instance.setStatus(status);
        return instance;
    }

    private WorkflowCancellationCleanup cleanup() {
        WorkflowCancellationCleanup cleanup = new WorkflowCancellationCleanup();
        cleanup.setId(1L);
        cleanup.setWorkflowInstanceId(101L);
        cleanup.setUserId(7L);
        cleanup.setStatus(WorkflowCancellationCleanup.PENDING);
        cleanup.setAttemptCount(0);
        return cleanup;
    }
}
