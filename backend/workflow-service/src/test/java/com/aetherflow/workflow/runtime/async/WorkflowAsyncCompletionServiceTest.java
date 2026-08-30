package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.node.executor.ImageWorkflowNodeResultFinisher;
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
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// pattern: Imperative Shell
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
        when(engine.completeWaitingNode(eq("101"), eq("node-ai"), any(), any()))
                .thenReturn(completed);

        WorkflowExecutionSnapshot result = service.completeSuccess(
                101L, "node-ai", Map.of("summary", "done"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        verify(repository, never()).save(any(WorkflowRuntimeSnapshot.class));
        verify(instanceMapper).transitionRuntimeState(
                eq(101L), eq("SUCCESS"), eq("node-export"), any(), any());
        verify(instanceMapper, never()).updateById(any(WorkflowInstance.class));
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
        when(engine.failWaitingNode(eq("101"), eq("node-ai"),
                eq("provider unavailable"), any())).thenReturn(failed);

        WorkflowExecutionSnapshot result = service.completeFailure(
                101L, "node-ai", "provider unavailable");

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.FAILED);
        verify(engine).failWaitingNode(eq("101"), eq("node-ai"),
                eq("provider unavailable"), any());
        verify(repository, never()).save(any(WorkflowRuntimeSnapshot.class));
        verify(instanceMapper).transitionRuntimeState(
                eq(101L), eq("FAILED"), eq("node-ai"), any(), any());
    }

    @Test
    void guardsNonTerminalInstanceProgressAgainstLateTerminalDowngrade() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot waiting = waitingSnapshot();
        WorkflowExecutionSnapshot stillWaiting = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.WAITING, "node-next",
                List.of("node-next"), Map.of("summary", "done"), Map.of(),
                List.of("node-ai"), List.of());
        when(engine.completeWaitingNode(eq("101"), eq("node-ai"), any(), any()))
                .thenReturn(stillWaiting);

        WorkflowExecutionSnapshot result = service.completeSuccess(
                101L, "node-ai", Map.of("summary", "done"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.WAITING);
        verify(instanceMapper).transitionRuntimeState(
                eq(101L), eq("WAITING"), eq("node-next"), isNull(), any());
        verify(instanceMapper, never()).updateById(any(WorkflowInstance.class));
    }

    @Test
    void adaptsWhisperCallbackOutputBeforeResumingDownstreamNodes() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot waiting = whisperWaitingSnapshot();
        WorkflowExecutionSnapshot completed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.SUCCESS, "node-whisper",
                Map.of("transcription", "hello world"), Map.of(), List.of("node-whisper"));
        AtomicReference<NodeResult> adapted = new AtomicReference<>();
        when(engine.completeWaitingNode(eq("101"), eq("node-whisper"), any(), any()))
                .thenAnswer(invocation -> {
                    Function<WorkflowRuntimeSnapshot, NodeResult> adapter = invocation.getArgument(2);
                    adapted.set(adapter.apply(waiting));
                    return completed;
                });

        service.completeSuccess(101L, "node-whisper", Map.of(
                "text", "hello world",
                "srtObjectKey", "transcripts/hello.srt",
                "durationSeconds", 12.5D));

        assertThat(adapted.get().variables()).containsExactlyInAnyOrderEntriesOf(Map.of(
                "transcription", "hello world",
                "srtObjectKey", "transcripts/hello.srt",
                "durationSeconds", 12.5D));
    }

    @Test
    void preservesClassifierBranchWhenCompletionArrivesAsynchronously() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowRuntimeSnapshot waiting = classifierWaitingSnapshot();
        WorkflowExecutionSnapshot completed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.SUCCESS, "node-classifier",
                Map.of("route", "billing"), Map.of(), List.of("node-classifier"));
        AtomicReference<NodeResult> adapted = new AtomicReference<>();
        when(engine.completeWaitingNode(eq("101"), eq("node-classifier"), any(), any()))
                .thenAnswer(invocation -> {
                    Function<WorkflowRuntimeSnapshot, NodeResult> adapter = invocation.getArgument(2);
                    adapted.set(adapter.apply(waiting));
                    return completed;
                });

        service.completeSuccess(101L, "node-classifier", Map.of(
                "completionText", "billing",
                "jsonData", Map.of("route", "billing", "confidence", 0.91D)));

        assertThat(adapted.get().variables()).containsEntry("route", "billing");
        assertThat(adapted.get().branchKey()).isEqualTo("billing");
    }

    @Test
    void routesAsyncImageOutputThroughSharedIoFinisher() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        ImageWorkflowNodeResultFinisher finisher = mock(ImageWorkflowNodeResultFinisher.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        ReflectionTestUtils.setField(service, "imageResultFinisher", finisher);
        WorkflowRuntimeSnapshot waiting = imageWaitingSnapshot();
        NodeResult finished = NodeResult.success(
                Map.of("imageFiles", List.of(Map.of("id", 501L))),
                Map.of("imageFileIds", List.of(501L)));
        when(finisher.supports("IMAGE_GENERATION")).thenReturn(true);
        when(finisher.finish(eq("IMAGE_GENERATION"), eq("101"), eq("node-image"),
                eq(waiting.variables()), any())).thenReturn(finished);
        AtomicReference<NodeResult> adapted = new AtomicReference<>();
        WorkflowExecutionSnapshot completed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.SUCCESS, "node-image",
                finished.variables(), Map.of(), List.of("node-image"));
        when(engine.completeWaitingNode(eq("101"), eq("node-image"), any(), any()))
                .thenAnswer(invocation -> {
                    Function<WorkflowRuntimeSnapshot, NodeResult> adapter = invocation.getArgument(2);
                    adapted.set(adapter.apply(waiting));
                    return completed;
                });

        service.completeSuccess(101L, "node-image", Map.of("images", List.of("base64")));

        assertThat(adapted.get()).isSameAs(finished);
        verify(finisher).finish(eq("IMAGE_GENERATION"), eq("101"), eq("node-image"),
                eq(waiting.variables()), any());
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
        when(engine.failWaitingNode(eq("101"), eq("node-human"),
                eq("human approval rejected: needs revision"), any())).thenReturn(failed);

        WorkflowExecutionSnapshot result = service.completeApproval(
                101L, "node-human",
                new HumanApprovalRequest(false, "needs revision", "ops", "webapp"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.FAILED);
        verify(engine).failWaitingNode(eq("101"), eq("node-human"),
                eq("human approval rejected: needs revision"), any());
        verify(repository, never()).save(any(WorkflowRuntimeSnapshot.class));
    }

    @Test
    void doesNotSilentlyDropAiResultWhileRuntimeIsStillStarting() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        when(engine.completeWaitingNode(eq("101"), eq("node-ai"), any(), any()))
                .thenThrow(new IllegalStateException("workflow runtime lock already held"));

        assertThatThrownBy(() -> service.completeSuccess(101L, "node-ai", Map.of("summary", "done")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("runtime lock already held");
        verifyNoInteractions(repository);
        verifyNoInteractions(instanceMapper);
    }

    @Test
    void delegatesCompletionToEngineBeforeReadingLatestSnapshot() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowRuntimeEngine engine = mock(WorkflowRuntimeEngine.class);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAsyncCompletionService service = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowExecutionSnapshot completed = new WorkflowExecutionSnapshot(
                "101", "trace-101", "101", RuntimeState.SUCCESS, "node-ai",
                Map.of("completion", "done"), Map.of(), List.of("node-ai"));
        when(engine.completeWaitingNode(eq("101"), eq("node-ai"), any(), any()))
                .thenReturn(completed);

        WorkflowExecutionSnapshot result = service.completeSuccess(
                101L, "node-ai", Map.of("completionText", "done"));

        assertThat(result.runtimeState()).isEqualTo(RuntimeState.SUCCESS);
        verifyNoInteractions(repository);
        verify(engine).completeWaitingNode(eq("101"), eq("node-ai"), any(), any());
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

    private WorkflowRuntimeSnapshot whisperWaitingSnapshot() {
        WorkflowNodeDTO whisper = new WorkflowNodeDTO();
        whisper.setNodeId("node-whisper");
        whisper.setNodeType("WHISPER");
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("whisper-async-test");
        definition.setNodes(List.of(whisper));
        return new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, definition, RuntimeState.WAITING,
                List.of("node-whisper"), List.of(), List.of(), Map.of("userId", 7L),
                Map.of("node-whisper", NodeResult.waiting(Map.of("externalTaskId", 91L))), Instant.now());
    }

    private WorkflowRuntimeSnapshot classifierWaitingSnapshot() {
        WorkflowNodeDTO classifier = new WorkflowNodeDTO();
        classifier.setNodeId("node-classifier");
        classifier.setNodeType("QUESTION_CLASSIFIER");
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("classifier-async-test");
        definition.setNodes(List.of(classifier));
        return new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, definition, RuntimeState.WAITING,
                List.of("node-classifier"), List.of(), List.of(), Map.of("userId", 7L),
                Map.of("node-classifier", NodeResult.waiting(Map.of("externalTaskId", 92L))), Instant.now());
    }

    private WorkflowRuntimeSnapshot imageWaitingSnapshot() {
        WorkflowNodeDTO image = new WorkflowNodeDTO();
        image.setNodeId("node-image");
        image.setNodeType("IMAGE_GENERATION");
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        definition.setName("image-async-test");
        definition.setNodes(List.of(image));
        return new WorkflowRuntimeSnapshot(
                "101", "trace-101", "101", 10L, definition, RuntimeState.WAITING,
                List.of("node-image"), List.of(), List.of(), Map.of("userId", 7L),
                Map.of("node-image", NodeResult.waiting(Map.of("externalTaskId", 93L))), Instant.now());
    }
}
