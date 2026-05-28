package com.aetherflow.task.service.impl;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.guard.QueueBackpressureGuard;
import com.aetherflow.task.mapper.TaskMapper;
import com.aetherflow.task.queue.TaskQueueProducer;
import com.aetherflow.task.service.RetryManager;
import com.aetherflow.task.service.TaskStateService;
import com.aetherflow.task.service.TimeoutChecker;
import com.aetherflow.task.support.TaskMessageFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaskDispatchServiceImplTest {

    @Mock
    private TaskMapper taskMapper;

    @Mock
    private TaskQueueProducer taskQueueProducer;

    @Mock
    private TaskStateService taskStateService;

    @Mock
    private TaskMessageFactory taskMessageFactory;

    @Mock
    private RetryManager retryManager;

    @Mock
    private TimeoutChecker timeoutChecker;

    @Mock
    private QueueBackpressureGuard queueBackpressureGuard;

    private TaskDispatchServiceImpl taskDispatchService;

    @BeforeEach
    void setUp() {
        TaskProperties properties = new TaskProperties();
        taskDispatchService = new TaskDispatchServiceImpl(
                taskMapper,
                taskQueueProducer,
                taskStateService,
                taskMessageFactory,
                retryManager,
                timeoutChecker,
                properties,
                queueBackpressureGuard);
    }

    @Test
    void createsTaskAndPublishesDispatchMessage() {
        TaskMessageDTO message = validMessage();
        when(taskMessageFactory.writePayload(message.getPayload())).thenReturn("{\"fileUrl\":\"https://example.test/video.mp4\"}");
        when(taskMapper.insert(any(Task.class))).thenAnswer(invocation -> {
            Task task = invocation.getArgument(0);
            task.setId(55L);
            return 1;
        });

        Long taskId = taskDispatchService.dispatch(message);

        assertThat(taskId).isEqualTo(55L);
        assertThat(message.getTaskId()).isEqualTo(55L);
        assertThat(message.getRetryCount()).isZero();
        verify(taskQueueProducer).publishForDispatch(message);
        verify(queueBackpressureGuard).assertTaskCreationAllowed(message);
        verify(taskStateService).mark(any(Task.class), eq(TaskStatus.QUEUED), any(LocalDateTime.class));
    }

    @Test
    void rejectsInvalidTaskMessage() {
        TaskMessageDTO message = validMessage();
        message.setNodeId("");

        assertThatThrownBy(() -> taskDispatchService.dispatch(message))
                .isInstanceOf(BusinessException.class);
    }

    private TaskMessageDTO validMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setWorkflowInstanceId(10L);
        message.setNodeId("node-1");
        message.setNodeType("AI_TRANSCRIPTION");
        message.setPayload(Map.of("fileUrl", "https://example.test/video.mp4"));
        return message;
    }
}
