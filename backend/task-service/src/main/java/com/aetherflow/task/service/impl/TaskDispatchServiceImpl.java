package com.aetherflow.task.service.impl;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.guard.QueueBackpressureGuard;
import com.aetherflow.task.mapper.TaskMapper;
import com.aetherflow.task.queue.TaskQueueProducer;
import com.aetherflow.task.service.RetryManager;
import com.aetherflow.task.service.TaskDispatchService;
import com.aetherflow.task.service.TaskStateService;
import com.aetherflow.task.service.TimeoutChecker;
import com.aetherflow.task.support.TaskMessageFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class TaskDispatchServiceImpl implements TaskDispatchService {

    private final TaskMapper taskMapper;
    private final TaskQueueProducer taskQueueProducer;
    private final TaskStateService taskStateService;
    private final TaskMessageFactory taskMessageFactory;
    private final RetryManager retryManager;
    private final TimeoutChecker timeoutChecker;
    private final TaskProperties properties;
    private final QueueBackpressureGuard queueBackpressureGuard;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Long dispatch(TaskMessageDTO taskMessage) {
        validate(taskMessage);
        queueBackpressureGuard.assertTaskCreationAllowed(taskMessage);

        LocalDateTime now = LocalDateTime.now();
        Task task = new Task();
        task.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        task.setNodeId(taskMessage.getNodeId());
        task.setNodeType(taskMessage.getNodeType());
        task.setPayloadJson(taskMessageFactory.writePayload(taskMessage.getPayload()));
        task.setRetryCount(taskMessage.getRetryCount() == null ? 0 : taskMessage.getRetryCount());
        task.setStatus(TaskStatus.PENDING.value());
        task.setNextRetryAt(now.plus(properties.getDispatchTimeout()));
        task.setCreatedAt(now);
        task.setUpdatedAt(now);
        taskMapper.insert(task);

        taskMessage.setTaskId(task.getId());
        taskMessage.setRetryCount(task.getRetryCount());
        taskMessage.setCreatedAt(OffsetDateTime.now());
        if (Boolean.FALSE.equals(taskMessage.getEnqueue())) {
            log.info("async task created without queue dispatch, taskId={}, workflowInstanceId={}, nodeId={}",
                    task.getId(), task.getWorkflowInstanceId(), task.getNodeId());
            return task.getId();
        }
        publishForDispatchAfterCommit(task, taskMessage, now.plus(properties.getDispatchTimeout()));
        log.info("async task created, taskId={}, workflowInstanceId={}, nodeId={}",
                task.getId(), task.getWorkflowInstanceId(), task.getNodeId());
        return task.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void markSucceeded(Long taskId) {
        if (taskId == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "task id is required");
        }
        Task task = taskMapper.selectById(taskId);
        if (task == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "task not found");
        }
        TaskStatus currentStatus = TaskStatus.from(task.getStatus());
        if (currentStatus == TaskStatus.SUCCEEDED) {
            taskStateService.cacheStatus(taskId, TaskStatus.SUCCEEDED);
            return;
        }
        if (currentStatus.terminal()) {
            log.warn("terminal task status update ignored, taskId={}, currentStatus={}, targetStatus={}",
                    taskId, currentStatus, TaskStatus.SUCCEEDED);
            return;
        }
        taskStateService.mark(task, TaskStatus.SUCCEEDED, null);
        log.info("task marked succeeded, taskId={}", taskId);
    }

    @Override
    public void compensateTimeouts() {
        int timeoutCount = timeoutChecker.checkTimeouts();
        int retryCount = retryManager.retryDueTasks();
        log.info("task compensation completed, timeoutHandled={}, retryRequeued={}", timeoutCount, retryCount);
    }

    private void publishForDispatchAfterCommit(Task task, TaskMessageDTO taskMessage, LocalDateTime dispatchDeadline) {
        Runnable publisher = () -> {
            try {
                taskQueueProducer.publishForDispatch(taskMessage);
                taskStateService.mark(task, TaskStatus.QUEUED, dispatchDeadline);
            } catch (RuntimeException exception) {
                log.error("task dispatch publish after commit failed, taskId={}", task.getId(), exception);
                retryManager.handleDispatchFailure(task, taskMessage, exception);
            }
        };
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            publisher.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                publisher.run();
            }
        });
    }

    private void validate(TaskMessageDTO taskMessage) {
        if (taskMessage == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "task message is required");
        }
        if (taskMessage.getWorkflowInstanceId() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow instance id is required");
        }
        if (taskMessage.getNodeId() == null || taskMessage.getNodeId().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "node id is required");
        }
        if (taskMessage.getNodeType() == null || taskMessage.getNodeType().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "node type is required");
        }
    }
}
