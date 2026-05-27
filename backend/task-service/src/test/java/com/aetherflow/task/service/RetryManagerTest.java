package com.aetherflow.task.service;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import com.aetherflow.task.queue.TaskQueueProducer;
import com.aetherflow.task.support.TaskMessageFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RetryManagerTest {

    @Mock
    private TaskMapper taskMapper;

    @Mock
    private TaskQueueProducer taskQueueProducer;

    @Mock
    private TaskStateService taskStateService;

    @Mock
    private TaskMessageFactory taskMessageFactory;

    private TaskProperties properties;
    private RetryManager retryManager;

    @BeforeEach
    void setUp() {
        properties = new TaskProperties();
        properties.setMaxRetries(3);
        retryManager = new RetryManager(taskMapper, taskQueueProducer, taskStateService, taskMessageFactory, properties);
    }

    @Test
    void schedulesRetryWhenRetryLimitAllowsAnotherAttempt() {
        Task task = task(0);
        TaskMessageDTO message = new TaskMessageDTO();
        when(taskMessageFactory.from(task)).thenReturn(message);

        retryManager.handleTimeout(task);

        assertThat(task.getRetryCount()).isEqualTo(1);
        verify(taskStateService).mark(eq(task), eq(TaskStatus.RETRYING), any(LocalDateTime.class));
    }

    @Test
    void publishesDeadLetterWhenRetryLimitIsExceeded() {
        Task task = task(3);
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(task.getId());
        when(taskMessageFactory.from(task)).thenReturn(message);

        retryManager.handleTimeout(task);

        verify(taskQueueProducer).publishToDeadLetter(eq(message), contains("timeout"));
        verify(taskStateService).mark(task, TaskStatus.FAILED, null);
    }

    @Test
    void requeuesDueRetryTasks() {
        Task task = task(1);
        task.setStatus(TaskStatus.RETRYING.value());
        task.setNextRetryAt(LocalDateTime.now().minusSeconds(1));
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(task.getId());
        when(taskMapper.selectList(any())).thenReturn(List.of(task));
        when(taskMessageFactory.from(task)).thenReturn(message);

        int count = retryManager.retryDueTasks();

        assertThat(count).isEqualTo(1);
        verify(taskQueueProducer).publishForDispatch(message);
        verify(taskStateService).mark(eq(task), eq(TaskStatus.QUEUED), any(LocalDateTime.class));
    }

    private Task task(int retryCount) {
        Task task = new Task();
        task.setId(100L);
        task.setWorkflowInstanceId(200L);
        task.setNodeId("node-1");
        task.setNodeType("AI_TRANSCRIPTION");
        task.setPayloadJson("{}");
        task.setRetryCount(retryCount);
        task.setStatus(TaskStatus.DISPATCHED.value());
        return task;
    }
}
