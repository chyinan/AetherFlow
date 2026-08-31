package com.aetherflow.task.service;

import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class TaskStateServiceTest {

    @Test
    void onlyTheReplicaThatWinsCasMayPublishTheNewStatusToCache() {
        TaskMapper mapper = mock(TaskMapper.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        TaskProperties properties = new TaskProperties();
        TaskStateService service = new TaskStateService(mapper, redis, properties);
        Task task = new Task();
        task.setId(7L);
        task.setStatus(TaskStatus.RETRYING.value());

        when(mapper.updateStatusIfCurrent(eq(7L), eq(TaskStatus.RETRYING.value()),
                eq(TaskStatus.DISPATCHING.value()), any(), any())).thenReturn(0);

        boolean updated = service.mark(task, TaskStatus.DISPATCHING, LocalDateTime.now());

        assertThat(updated).isFalse();
        assertThat(task.getStatus()).isEqualTo(TaskStatus.RETRYING.value());
        verify(redis, never()).opsForValue();
    }
}
