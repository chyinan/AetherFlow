package com.aetherflow.task.service;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.mapper.TaskMapper;
import com.aetherflow.task.queue.TaskQueueProducer;
import com.aetherflow.task.support.TaskMessageFactory;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class RetryManager {

    private final TaskMapper taskMapper;
    private final TaskQueueProducer taskQueueProducer;
    private final TaskStateService taskStateService;
    private final TaskMessageFactory taskMessageFactory;
    private final TaskProperties properties;

    @Scheduled(fixedDelayString = "${aetherflow.task.scheduler.retry-fixed-delay:60000}")
    public void scheduledRetryDueTasks() {
        if (!properties.getScheduler().isEnabled()) {
            return;
        }
        retryDueTasks();
    }

    public int retryDueTasks() {
        LocalDateTime now = LocalDateTime.now();
        List<Task> dueTasks = taskMapper.selectList(new LambdaQueryWrapper<Task>()
                .in(Task::getStatus, TaskStatus.RETRYING.value(), TaskStatus.TIMEOUT.value())
                .le(Task::getNextRetryAt, now)
                .last("LIMIT " + Math.max(1, properties.getScanLimit())));
        int requeued = 0;
        for (Task task : dueTasks) {
            try {
                requeue(task, "retry due");
                requeued++;
            } catch (RuntimeException exception) {
                log.error("task retry requeue failed, taskId={}", task.getId(), exception);
            }
        }
        if (requeued > 0) {
            log.info("task retry scan completed, requeued={}", requeued);
        }
        return requeued;
    }

    public void handleDispatchFailure(Task task, TaskMessageDTO taskMessage, Throwable cause) {
        String reason = cause == null ? "task dispatch failed" : cause.getMessage();
        scheduleRetryOrDeadLetter(task, taskMessage, reason);
    }

    public void handleTimeout(Task task) {
        scheduleRetryOrDeadLetter(task, taskMessageFactory.from(task), "task timeout");
    }

    private void requeue(Task task, String reason) {
        TaskMessageDTO taskMessage = taskMessageFactory.from(task);
        taskQueueProducer.publishForDispatch(taskMessage);
        taskStateService.mark(task, TaskStatus.QUEUED, LocalDateTime.now().plus(properties.getDispatchTimeout()));
        log.info("task requeued, taskId={}, retryCount={}, reason={}", task.getId(), task.getRetryCount(), reason);
    }

    private void scheduleRetryOrDeadLetter(Task task, TaskMessageDTO taskMessage, String reason) {
        int nextRetryCount = safeRetryCount(task) + 1;
        if (nextRetryCount > properties.getMaxRetries()) {
            taskMessage.setRetryCount(safeRetryCount(task));
            taskQueueProducer.publishToDeadLetter(taskMessage, reason);
            taskStateService.mark(task, TaskStatus.FAILED, null);
            log.warn("task moved to dead-letter queue, taskId={}, retryCount={}, reason={}",
                    task.getId(), task.getRetryCount(), reason);
            return;
        }

        task.setRetryCount(nextRetryCount);
        taskMessage.setRetryCount(nextRetryCount);
        LocalDateTime nextRetryAt = LocalDateTime.now().plus(calculateBackoff(nextRetryCount));
        taskStateService.mark(task, TaskStatus.RETRYING, nextRetryAt);
        log.warn("task scheduled for retry, taskId={}, retryCount={}, nextRetryAt={}, reason={}",
                task.getId(), nextRetryCount, nextRetryAt, reason);
    }

    private int safeRetryCount(Task task) {
        return task.getRetryCount() == null ? 0 : task.getRetryCount();
    }

    private Duration calculateBackoff(int retryCount) {
        long multiplier = 1L << Math.min(retryCount - 1, 10);
        Duration delay = properties.getRetryInitialInterval().multipliedBy(multiplier);
        return delay.compareTo(properties.getRetryMaxInterval()) > 0 ? properties.getRetryMaxInterval() : delay;
    }
}
