package com.aetherflow.ai.outbox;

import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.task.AiTaskStatus;
import com.aetherflow.ai.task.AiJobLease;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class AiTaskTerminalPersistenceServiceTest {

    @Test
    void recordsSucceededJobAndPendingEventInOneTransactionalOperation() throws Exception {
        AiJobMapper jobMapper = mock(AiJobMapper.class);
        AiTaskEventOutboxMapper outboxMapper = mock(AiTaskEventOutboxMapper.class);
        doAnswer(invocation -> {
            AiTaskEventOutbox event = invocation.getArgument(0);
            event.setId(501L);
            return 1;
        }).when(outboxMapper).insert(any(AiTaskEventOutbox.class));
        AiTaskTerminalPersistenceService service = new AiTaskTerminalPersistenceService(
                jobMapper, outboxMapper, new ObjectMapper());
        AiJob job = new AiJob();
        job.setId(100L);
        job.setTaskId(59L);
        AiJobLease lease = new AiJobLease(100L, "lease-1", LocalDateTime.now().plusMinutes(2));
        when(jobMapper.completeAiJobWithLease(eq(100L), eq("lease-1"), eq(AiTaskStatus.SUCCEEDED),
                any(String.class))).thenReturn(1);
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult(
                "LLM", "SUCCEEDED", Map.of("completionText", "done"), List.of());

        AiTaskEventOutbox event = service.recordSuccess(job, lease, message, result);

        assertThat(job.getStatus()).isEqualTo(AiTaskStatus.SUCCEEDED);
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PENDING);
        assertThat(event.getEventType()).isEqualTo("AI_TASK_SUCCEEDED");
        assertThat(event.getEventId()).isEqualTo("ai-task:59:node-1:AI_TASK_SUCCEEDED");
        assertThat(event.getPayloadJson()).contains("completionText", "done");
        verify(jobMapper).completeAiJobWithLease(eq(100L), eq("lease-1"), eq(AiTaskStatus.SUCCEEDED),
                any(String.class));
        verify(outboxMapper).insert(event);
        Method method = AiTaskTerminalPersistenceService.class.getMethod(
                "recordSuccess", AiJob.class, AiJobLease.class, TaskMessageDTO.class, AiNodeResult.class);
        assertThat(method.getAnnotation(Transactional.class)).isNotNull();
    }

    @Test
    void zombieWorkerCannotWriteTerminalStateOrOutboxAfterLeaseIsLost() {
        AiJobMapper jobMapper = mock(AiJobMapper.class);
        AiTaskEventOutboxMapper outboxMapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskTerminalPersistenceService service = new AiTaskTerminalPersistenceService(
                jobMapper, outboxMapper, new ObjectMapper());
        AiJob job = new AiJob();
        job.setId(100L);
        AiJobLease staleLease = new AiJobLease(100L, "stale-token", LocalDateTime.now().minusSeconds(1));
        when(jobMapper.completeAiJobWithLease(eq(100L), eq("stale-token"), eq(AiTaskStatus.SUCCEEDED),
                any(String.class))).thenReturn(0);

        assertThatThrownBy(() -> service.recordSuccess(
                job, staleLease, taskMessage(), new AiNodeResult("LLM", "SUCCEEDED", Map.of(), List.of())))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("lease ownership lost");
        verify(outboxMapper, never()).insert(any(AiTaskEventOutbox.class));
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(101L);
        message.setTraceId("trace-59");
        message.setNodeId("node-1");
        message.setNodeType("LLM");
        message.setPayload(Map.of("prompt", "summarize"));
        return message;
    }
}
