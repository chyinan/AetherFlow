package com.aetherflow.task.service;

import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskStateService {

    private static final String TASK_STATUS_KEY_PREFIX = "aetherflow:task:";

    private final TaskMapper taskMapper;
    private final StringRedisTemplate redisTemplate;
    private final TaskProperties properties;

    public Optional<Task> findById(Long taskId) {
        if (taskId == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(taskMapper.selectById(taskId));
    }

    public boolean mark(Task task, TaskStatus status, LocalDateTime nextRetryAt) {
        if (task == null || task.getId() == null || status == null) {
            return false;
        }
        String expectedStatus = task.getStatus() == null
                ? TaskStatus.PENDING.value()
                : task.getStatus();
        LocalDateTime updatedAt = LocalDateTime.now();
        if (taskMapper.updateStatusIfCurrent(task.getId(), expectedStatus, status.value(), nextRetryAt, updatedAt) != 1) {
            log.info("task state CAS lost, taskId={}, expectedStatus={}, targetStatus={}",
                    task.getId(), expectedStatus, status.value());
            return false;
        }
        task.setStatus(status.value());
        task.setNextRetryAt(nextRetryAt);
        task.setUpdatedAt(updatedAt);
        cacheStatus(task.getId(), status);
        return true;
    }

    public void cacheStatus(Long taskId, TaskStatus status) {
        if (taskId == null) {
            return;
        }
        try {
            redisTemplate.opsForValue().set(TASK_STATUS_KEY_PREFIX + taskId, status.value(), properties.getRedisTtl());
        } catch (DataAccessException exception) {
            log.warn("task status cache update failed, taskId={}, status={}", taskId, status, exception);
        }
    }
}
