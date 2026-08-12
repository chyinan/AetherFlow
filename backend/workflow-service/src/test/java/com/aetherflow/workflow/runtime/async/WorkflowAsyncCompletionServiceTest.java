package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.controller.HumanApprovalRequest;
import com.aetherflow.workflow.runtime.engine.WorkflowExecutionSnapshot;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeRequest;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WorkflowAsyncCompletionServiceTest {

    @Test
    void completesWaitingNodeAndUpdatesWorkflowInstance() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, properties, instanceMapper);
        WorkflowRuntimeSnapshot waiting = waitingSnapshot();
        WorkflowExecutionSnapshot completed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.SUCCESS, "node-export",
                Map.of("summary", "done"), Map.of(), List.of("node-ai", "node-export"));
        when(repository.findByWorkflowId("101")).thenReturn(Optional.of(waiting));
        when(engine.completeWaitingNode(any(WorkflowRuntimeRequest.class),
                eq(waiting.toExecutionSnapshot()), eq("node-ai"), any(NodeResult.class)))
                .thenReturn(completed);

        WorkflowExecutionSnapshot result = service.completeSuccess(
                101L, "node-ai", Map.of("summary", "done"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        verify(repository).save(any(WorkflowRuntimeSnapshot.class));
        verify(instanceMapper).updateById(any(WorkflowInstance.class));
    }

    @Test
    void marksWaitingWorkflowFailedWhenAiTaskFails() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot waiting = waitingSnapshot();
        WorkflowExecutionSnapshot failed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.FAILED, "node-ai",
                List.of(), Map.of(),
                Map.of("node-ai", NodeResult.success(Map.of("error", "provider unavailable"))),
                List.of(), List.of("node-ai"));
        when(repository.findByWorkflowId("101")).thenReturn(Optional.of(waiting));
        when(engine.failWaitingNode(any(WorkflowRuntimeRequest.class), eq(waiting.toExecutionSnapshot()),
                eq("node-ai"), eq("provider unavailable"))).thenReturn(failed);

        WorkflowExecutionSnapshot result = service.completeFailure(
                101L, "node-ai", "provider unavailable");

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.FAILED);
        verify(engine).failWaitingNode(any(WorkflowRuntimeRequest.class), eq(waiting.toExecutionSnapshot()),
                eq("node-ai"), eq("provider unavailable"));
        verify(repository).save(any(WorkflowRuntimeSnapshot.class));
        verify(instanceMapper).updateById(any(WorkflowInstance.class));
    }

    @Test
    void rejectsHumanApprovalByDefaultInsteadOfContinuingAsSuccess() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot waiting = humanWaitingSnapshot();
        WorkflowExecutionSnapshot failed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.FAILED, "node-human",
                List.of(), Map.of("approved", false), Map.of(),
                List.of(), List.of("node-human"));
        when(repository.findByWorkflowId("101")).thenReturn(Optional.of(waiting));
        when(engine.failWaitingNode(any(WorkflowRuntimeRequest.class),
                eq(waiting.toExecutionSnapshot()), eq("node-human"),
                eq("human approval rejected: needs revision"))).thenReturn(failed);

        WorkflowExecutionSnapshot result = service.completeApproval(
                101L, "node-human",
                new HumanApprovalRequest(false, "needs revision", "ops", "webapp"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.FAILED);
        verify(engine).failWaitingNode(any(WorkflowRuntimeRequest.class),
                eq(waiting.toExecutionSnapshot()), eq("node-human"),
                eq("human approval rejected: needs revision"));
        verify(repository).save(any(WorkflowRuntimeSnapshot.class));
    }

    @Test
    void doesNotSilentlyDropAiResultWhileRuntimeIsStillStarting() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot running = new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, new WorkflowDefinitionDTO(), RuntimeState.RUNNING,
                List.of("node-ai"), List.of(), List.of(), Map.of(), Map.of(), Instant.now());
        when(repository.findByWorkflowId("101")).thenReturn(Optional.of(running));

        assertThatThrownBy(() -> service.completeSuccess(101L, "node-ai", Map.of("summary", "done")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not ready for AI completion");
        verifyNoInteractions(engine);
        verifyNoInteractions(instanceMapper);
    }

    private WorkflowRuntimeSnapshot waitingSnapshot() {
        return new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, new WorkflowDefinitionDTO(), RuntimeState.WAITING,
                List.of("node-ai"), List.of(), List.of(), Map.of("userId", 7L, "username", "reviewer"),
                Map.of("node-ai", NodeResult.waiting(Map.of("externalTaskId", 91L))), Instant.now());
    }

    private WorkflowRuntimeSnapshot humanWaitingSnapshot() {
        WorkflowNodeDTO human = new WorkflowNodeDTO();
        human.setNodeId("node-human");
        human.setNodeType("HUMAN");
        human.setConfig(Map.of("autoApprove", false));
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("approval-test");
        definition.setNodes(List.of(human));
        return new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, definition, RuntimeState.WAITING,
                List.of("node-human"), List.of(), List.of(), Map.of("userId", 7L),
                Map.of("node-human", NodeResult.waiting(Map.of("approvalStatus", "pending"))), Instant.now());
    }
}
