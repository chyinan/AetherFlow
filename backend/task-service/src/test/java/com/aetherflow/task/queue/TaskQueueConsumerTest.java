package com.aetherflow.task.queue;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.guard.AiDispatchSentinelGuard;
import com.aetherflow.task.mapper.TaskMapper;
import com.aetherflow.task.service.RetryManager;
import com.aetherflow.task.service.TaskStateService;
import com.aetherflow.task.support.TaskMessageFactory;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class TaskQueueConsumerTest {

    private static final long TASK_ID = 7L;
    private final TaskMapper mapper = mock(TaskMapper.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final TaskQueueProducer producer = mock(TaskQueueProducer.class);
    private final RetryManager retryManager = mock(RetryManager.class);
    private final AtomicReference<String> storedStatus = new AtomicReference<>(TaskStatus.PENDING.value());
    private final TaskProperties properties = new TaskProperties();
    private final TaskQueueConsumer consumer = new TaskQueueConsumer(producer, retryManager,
            new TaskStateService(mapper, redis, properties), new TaskMessageFactory(new ObjectMapper()),
            properties, mock(AiDispatchSentinelGuard.class));

    @BeforeEach
    @SuppressWarnings("unchecked")
    void readDetachedTaskRow() {
        when(redis.opsForValue()).thenReturn(mock(ValueOperations.class));
        when(mapper.selectById(TASK_ID)).thenAnswer(ignored -> {
            Task row = new Task();
            row.setId(TASK_ID);
            row.setStatus(storedStatus.get());
            row.setRetryCount(0);
            return row;
        });
    }

    @ParameterizedTest
    @EnumSource(value = TaskStatus.class, names = {"PENDING", "QUEUED"}, mode = EnumSource.Mode.EXCLUDE)
    void keepsNewIneligibleStatusWhenInitialCasLoses(TaskStatus winningStatus) {
        // 在读取和 CAS 之间完成取消、任务回写或其他消费者的抢占；
        // 在 mapper 边界复现 SQL 中的状态相等条件。
        raceClaimsWith(winningStatus);

        consumer.consumeDispatchTask(dispatchMessage());

        assertThat(storedStatus.get()).isEqualTo(winningStatus.value());
        verifyNoInteractions(producer, retryManager);
    }

    @Test
    void retriesIfProducerMovedPendingRowToQueuedAfterItsRead() {
        raceClaimsWith(TaskStatus.QUEUED);

        consumer.consumeDispatchTask(dispatchMessage());

        assertThat(storedStatus.get()).isEqualTo(TaskStatus.DISPATCHED.value());
        verify(producer).publishToWorker(argThat(message -> message.getTaskId() == TASK_ID));
        verifyNoInteractions(retryManager);
    }

    @Test
    void leavesTaskCancelledIfEvenTheRefreshedClaimLoses() {
        raceClaimsWith(TaskStatus.QUEUED, TaskStatus.CANCELLED);

        consumer.consumeDispatchTask(dispatchMessage());

        assertThat(storedStatus.get()).isEqualTo(TaskStatus.CANCELLED.value());
        verifyNoInteractions(producer, retryManager);
    }

    private void raceClaimsWith(TaskStatus... winningStatuses) {
        AtomicInteger updateCount = new AtomicInteger();
        when(mapper.updateStatusIfCurrent(eq(TASK_ID), any(String.class), any(String.class),
                any(), any(LocalDateTime.class), eq(0))).thenAnswer(call -> {
            int update = updateCount.getAndIncrement();
            if (update < winningStatuses.length) {
                storedStatus.set(winningStatuses[update].value());
            }
            String expected = call.getArgument(1);
            String target = call.getArgument(2);
            if (!storedStatus.get().equals(expected)) {
                return 0;
            }
            storedStatus.set(target);
            return 1;
        });
    }

    private TaskMessageDTO dispatchMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(TASK_ID);
        return message;
    }
}
