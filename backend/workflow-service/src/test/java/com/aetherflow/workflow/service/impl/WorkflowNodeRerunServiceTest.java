package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.entity.WorkflowStartOutbox;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowStartOutboxMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.persistence.InMemoryRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.security.AuthenticatedUserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WorkflowNodeRerunServiceTest {
    private WorkflowInstanceMapper instances;
    private WorkflowStartOutboxMapper outboxes;
    private WorkflowServiceImpl workflowService;
    private InMemoryRuntimeSnapshotRepository snapshots;
    private WorkflowNodeRerunService service;
    private WorkflowInstance original;

    @BeforeEach
    void setUp() {
        instances = mock(WorkflowInstanceMapper.class);
        outboxes = mock(WorkflowStartOutboxMapper.class);
        workflowService = mock(WorkflowServiceImpl.class);
        snapshots = new InMemoryRuntimeSnapshotRepository();
        service = new WorkflowNodeRerunService(instances, outboxes, snapshots, workflowService, new ObjectMapper());
        original = new WorkflowInstance(); original.setId(1L); original.setUserId(7L); original.setDefinitionId(10L);
        original.setStatus("FAILED"); original.setInputJson("{\"input\":\"original\"}");
        when(instances.selectById(1L)).thenReturn(original);
        WorkflowNodeDTO start = new WorkflowNodeDTO(); start.setNodeId("start"); start.setNodeType("START"); start.setConfig(Map.of("next", "failed"));
        WorkflowNodeDTO failed = new WorkflowNodeDTO(); failed.setNodeId("failed"); failed.setNodeType("FAILED"); failed.setConfig(Map.of());
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO(); definition.setNodes(List.of(start, failed));
        snapshots.save(new WorkflowRuntimeSnapshot("1", "trace-1", "1", 10L, definition, RuntimeState.FAILED,
                List.of(), List.of("start"), List.of("failed"), Map.of("stale", "value"),
                Map.of("start", NodeResult.success(Map.of("input", "paid"), Map.of("input", "paid"))), Instant.now()));
    }

    @Test
    void createsOnePendingSeedAndOutboxAndReusesReceiptOnRepeatedClicks() {
        AtomicReference<WorkflowInstance> stored = new AtomicReference<>();
        when(instances.findByUserIdAndIdempotencyKey(eq(7L), anyString())).thenAnswer(invocation -> stored.get());
        when(instances.insertIdempotent(any())).thenAnswer(invocation -> {
            WorkflowInstance child = invocation.getArgument(0); child.setId(2L); stored.set(child); return 1;
        });
        AuthenticatedUserContext.runAs(7L, "operator", () -> {
            var preview = service.preview(1L, "failed");
            assertThat(preview.eligible()).isTrue();
            WorkflowInstance first = service.rerun(1L, "failed", preview.revision());
            assertThat(service.rerun(1L, "failed", preview.revision())).isSameAs(first);
            assertThat(first.getStatus()).isEqualTo("PENDING");
            var seed = snapshots.findByWorkflowId("2").orElseThrow();
            assertThat(seed.runtimeState()).isEqualTo(RuntimeState.PENDING);
            assertThat(seed.variables()).containsEntry("input", "paid").doesNotContainKey("stale");
            return null;
        });
        verify(instances, times(1)).insertIdempotent(any());
        verify(outboxes, times(1)).insert(any(WorkflowStartOutbox.class));
        verify(workflowService, times(1)).dispatchPendingStarts();
        verify(workflowService).validateRuntimePreflight(argThat(definition -> definition.getNodes().size() == 1
                && definition.getNodes().get(0).getNodeId().equals("failed")));
        assertThat(original.getStatus()).isEqualTo("FAILED");
    }

    @Test
    void duplicateInsertLoserReturnsWinnerWithoutSecondSnapshotOrOutbox() {
        WorkflowInstance winner = new WorkflowInstance(); winner.setId(2L);
        when(instances.findByUserIdAndIdempotencyKey(eq(7L), anyString())).thenReturn(null, winner);
        when(instances.insertIdempotent(any())).thenReturn(0);
        AuthenticatedUserContext.runAs(7L, "operator", () -> {
            assertThat(service.rerun(1L, "failed", service.preview(1L, "failed").revision())).isSameAs(winner); return null;
        });
        assertThat(snapshots.findByWorkflowId("2")).isEmpty();
        verifyNoInteractions(outboxes);
        verify(workflowService, never()).dispatchPendingStarts();
    }

    @Test
    void rejectsStalePreviewBeforeCreatingOrPreflighting() {
        AuthenticatedUserContext.runAs(7L, "operator", () -> {
            assertThatThrownBy(() -> service.rerun(1L, "failed", "old-revision")).isInstanceOf(BusinessException.class).hasMessageContaining("快照已变化"); return null;
        });
        verify(instances, never()).insertIdempotent(any());
        verifyNoInteractions(outboxes, workflowService);
    }

    @Test
    void onlyFailedBackendProjectionIsEligible() {
        for (String status : List.of("SUCCESS", "CANCELLED", "RUNNING", "WAITING", "PENDING")) {
            original.setStatus(status);
            AuthenticatedUserContext.runAs(7L, "operator", () -> {
                var preview = service.preview(1L, "failed");
                assertThat(preview.eligible()).isFalse();
                assertThatThrownBy(() -> service.rerun(1L, "failed", preview.revision())).isInstanceOf(BusinessException.class); return null;
            });
        }
        verify(instances, never()).insertIdempotent(any());
    }

    @Test
    void dispatchesOnlyAfterTransactionCommits() throws Exception {
        assertThat(WorkflowNodeRerunService.class.getMethod("rerun", Long.class, String.class, String.class).getAnnotation(Transactional.class)).isNotNull();
        when(instances.insertIdempotent(any())).thenAnswer(invocation -> {
            ((WorkflowInstance) invocation.getArgument(0)).setId(2L); return 1;
        });
        TransactionSynchronizationManager.initSynchronization();
        try {
            AuthenticatedUserContext.runAs(7L, "operator", () -> service.rerun(1L, "failed", service.preview(1L, "failed").revision()));
            verify(workflowService, never()).dispatchPendingStarts();
            assertThat(snapshots.findByWorkflowId("2").orElseThrow().runtimeState()).isEqualTo(RuntimeState.PENDING);
            TransactionSynchronizationManager.getSynchronizations().forEach(synchronization -> synchronization.afterCommit());
            verify(workflowService).dispatchPendingStarts();
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }
}
