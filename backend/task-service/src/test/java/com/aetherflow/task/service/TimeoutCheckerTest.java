package com.aetherflow.task.service;

import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TimeoutCheckerTest {

    @Test
    void retriesTasksThatWereDispatchedButNeverCompleted() {
        TaskMapper taskMapper = mock(TaskMapper.class);
        TaskStateService taskStateService = mock(TaskStateService.class);
        RetryManager retryManager = mock(RetryManager.class);
        TaskProperties properties = new TaskProperties();
        TimeoutChecker timeoutChecker = new TimeoutChecker(taskMapper, taskStateService, retryManager, properties);
        Task dispatched = new Task();
        dispatched.setId(58L);
        dispatched.setStatus(TaskStatus.DISPATCHED.value());
        dispatched.setNextRetryAt(LocalDateTime.now().minusMinutes(1));
        when(taskMapper.selectList(any())).thenReturn(List.of(dispatched));

        int handled = timeoutChecker.checkTimeouts();

        assertThat(handled).isEqualTo(1);
        verify(taskStateService).mark(eq(dispatched), eq(TaskStatus.TIMEOUT), any());
        verify(retryManager).handleTimeout(dispatched);
    }
}
