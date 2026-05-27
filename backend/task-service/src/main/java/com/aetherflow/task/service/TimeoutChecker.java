package com.aetherflow.task.service;

import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class TimeoutChecker {

    private final TaskMapper taskMapper;
    private final TaskStateService taskStateService;
    private final RetryManager retryManager;
    private final TaskProperties properties;

    @Scheduled(fixedDelayString = "${aetherflow.task.scheduler.timeout-fixed-delay:60000}")
    public void scheduledCheckTimeouts() {
        if (!properties.getScheduler().isEnabled()) {
            return;
        }
        checkTimeouts();
    }

    public int checkTimeouts() {
        LocalDateTime now = LocalDateTime.now();
        List<Task> timedOutTasks = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .in(Task::getStatus,
                        TaskStatus.PENDING.value(),
                        TaskStatus.QUEUED.value(),
                        TaskStatus.DISPATCHING.value())
                .le(Task::getNextRetryAt, now)
                .last("LIMIT " + Math.max(1, properties.getScanLimit())));
        int handled = 0;
        for (Task task : timedOutTasks) {
            try {
                if (!isTimeoutRetryCandidate(task)) {
                    log.info("task timeout ignored, taskId={}, status={}", task.getId(), task.getStatus());
                    continue;
                }
                taskStateService.mark(task, TaskStatus.TIMEOUT, now);
                retryManager.handleTimeout(task);
                handled++;
            } catch (RuntimeException exception) {
                log.error("task timeout handling failed, taskId={}", task.getId(), exception);
            }
        }
        if (handled > 0) {
            log.warn("task timeout scan completed, handled={}", handled);
        }
        return handled;
    }

    private boolean isTimeoutRetryCandidate(Task task) {
        try {
            TaskStatus status = TaskStatus.from(task.getStatus());
            return status == TaskStatus.PENDING || status == TaskStatus.QUEUED || status == TaskStatus.DISPATCHING;
        } catch (IllegalArgumentException exception) {
            log.warn("task timeout skipped because status is unknown, taskId={}, status={}",
                    task.getId(), task.getStatus(), exception);
            return false;
        }
    }
}
