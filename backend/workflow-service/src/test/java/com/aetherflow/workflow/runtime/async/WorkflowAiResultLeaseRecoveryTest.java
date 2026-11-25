package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.mapper.WorkflowRuntimeSnapshotMapper;
import com.aetherflow.workflow.runtime.api.NodeRegistry;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.core.RuntimeStateMachine;
import com.aetherflow.workflow.runtime.core.WorkflowRuntimeLeaseLostException;
import com.aetherflow.workflow.runtime.engine.WorkflowRuntimeEngine;
import com.aetherflow.workflow.runtime.persistence.MybatisRuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshotEntity;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowAiResultLeaseRecoveryTest {

    @ParameterizedTest
    @MethodSource("terminalDeliveries")
    void acknowledgesResultRedeliveryForTerminalWorkflow(RuntimeState state, String eventType) {
        WorkflowRuntimeSnapshotMapper snapshotMapper = mock(WorkflowRuntimeSnapshotMapper.class);
        WorkflowRuntimeSnapshotEntity terminal = snapshot(state);
        when(snapshotMapper.selectOne(any(Wrapper.class))).thenReturn(terminal);
        // 真实 UPDATE 明确排除终态快照，即使传入 fencing token 匹配也会返回 0。
        when(snapshotMapper.claimForLease("101", "original-lease", "noop")).thenReturn(0);
        WorkflowInstanceMapper instanceMapper = mock(WorkflowInstanceMapper.class);
        WorkflowAiResultListener listener = listener(snapshotMapper, instanceMapper);

        assertThatCode(() -> listener.handle(event(eventType))).doesNotThrowAnyException();

        verify(snapshotMapper).claimForLease("101", "original-lease", "noop");
        verify(snapshotMapper, never()).updateIfOwned(any());
        verify(instanceMapper, never()).transitionRuntimeState(any(), any(), any(), any(), any());
    }

    @Test
    void propagatesLeaseConflictWhileWorkflowStillWaits() {
        WorkflowRuntimeSnapshotMapper snapshotMapper = mock(WorkflowRuntimeSnapshotMapper.class);
        when(snapshotMapper.selectOne(any(Wrapper.class))).thenReturn(snapshot(RuntimeState.WAITING));
        when(snapshotMapper.claimForLease("101", "original-lease", "noop")).thenReturn(0);
        WorkflowAiResultListener listener = listener(snapshotMapper, mock(WorkflowInstanceMapper.class));

        assertThatThrownBy(() -> listener.handle(event("AI_TASK_SUCCEEDED")))
                .isInstanceOf(WorkflowRuntimeLeaseLostException.class);
    }

    @Test
    void propagatesLeaseConflictWithoutDurableTerminalEvidence() {
        WorkflowRuntimeSnapshotMapper snapshotMapper = mock(WorkflowRuntimeSnapshotMapper.class);
        when(snapshotMapper.selectOne(any(Wrapper.class))).thenReturn(snapshot(RuntimeState.WAITING), null);
        when(snapshotMapper.claimForLease("101", "original-lease", "noop")).thenReturn(0);
        WorkflowAiResultListener listener = listener(snapshotMapper, mock(WorkflowInstanceMapper.class));

        assertThatThrownBy(() -> listener.handle(event("AI_TASK_FAILED")))
                .isInstanceOf(WorkflowRuntimeLeaseLostException.class);
    }

    static Stream<Arguments> terminalDeliveries() {
        return Stream.of(RuntimeState.SUCCESS, RuntimeState.FAILED, RuntimeState.CANCELLED)
                .flatMap(state -> Stream.of("AI_TASK_SUCCEEDED", "AI_TASK_FAILED")
                        .map(eventType -> Arguments.of(state, eventType)));
    }

    private static WorkflowAiResultListener listener(WorkflowRuntimeSnapshotMapper snapshotMapper,
                                                    WorkflowInstanceMapper instanceMapper) {
        var repository = new MybatisRuntimeSnapshotRepository(snapshotMapper, new ObjectMapper());
        var engine = new WorkflowRuntimeEngine(new NodeRegistry(List.of()), new RuntimeStateMachine(),
                event -> { }, duration -> { }, repository);
        var completion = new WorkflowAsyncCompletionService(
                repository, engine, new WorkflowRuntimeProperties(), instanceMapper);
        WorkflowInstance instance = new WorkflowInstance();
        instance.setId(101L);
        instance.setUserId(7L);
        when(instanceMapper.selectById(101L)).thenReturn(instance);
        WorkflowAiResultListener listener = new WorkflowAiResultListener(completion);
        ReflectionTestUtils.setField(listener, "workflowInstanceMapper", instanceMapper);
        return listener;
    }

    private static WorkflowRuntimeSnapshotEntity snapshot(RuntimeState state) {
        WorkflowRuntimeSnapshotEntity entity = new WorkflowRuntimeSnapshotEntity();
        entity.setId(4L);
        entity.setWorkflowId("101");
        entity.setTraceId("trace-101");
        entity.setTaskId("workflow-task-101");
        entity.setRuntimeState(state.name());
        entity.setFencingToken("original-lease");
        entity.setDefinitionJson("{}");
        entity.setCurrentNodeIdsJson("[]");
        entity.setCompletedNodeIdsJson("[]");
        entity.setFailedNodeIdsJson("[]");
        entity.setVariablesJson("{}");
        entity.setNodeOutputsJson("{}");
        return entity;
    }

    private static NotifyMessageDTO event(String eventType) {
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setEventType(eventType);
        message.setUserId(7L);
        message.setPayload(Map.of("workflowInstanceId", 101L, "taskId", 42L, "nodeId", "node-ai",
                "output", Map.of("summary", "done"), "error", "模型暂不可用"));
        return message;
    }
}
