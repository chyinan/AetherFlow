package com.aetherflow.task.queue;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.entity.Task;
import com.aetherflow.task.enums.TaskStatus;
import com.aetherflow.task.guard.AiDispatchSentinelGuard;
import com.aetherflow.task.service.RetryManager;
import com.aetherflow.task.service.TaskStateService;
import com.aetherflow.task.support.TaskMessageFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskQueueConsumer {

    private final TaskQueueProducer taskQueueProducer;
    private final RetryManager retryManager;
    private final TaskStateService taskStateService;
    private final TaskMessageFactory taskMessageFactory;
    private final TaskProperties properties;
    private final AiDispatchSentinelGuard sentinelGuard;

    @RabbitListener(queues = "${aetherflow.task.mq.dispatch-queue}",
            autoStartup = "${aetherflow.task.consumer.dispatch-enabled:true}")
    public void consumeDispatchTask(TaskMessageDTO taskMessage) {
        Long taskId = taskMessage == null ? null : taskMessage.getTaskId();
        Task task = taskStateService.findById(taskId)
                .orElseThrow(() -> new AmqpRejectAndDontRequeueException("task not found, taskId=" + taskId));
        TaskStatus currentStatus = TaskStatus.from(task.getStatus());
        if (currentStatus.terminal() || currentStatus == TaskStatus.DISPATCHED) {
            log.info("task dispatch message ignored, taskId={}, status={}", taskId, currentStatus);
            return;
        }

        try {
            taskStateService.mark(task, TaskStatus.DISPATCHING, LocalDateTime.now().plus(properties.getDispatchTimeout()));
            TaskMessageDTO workerMessage = taskMessageFactory.from(task);
            sentinelGuard.checkConsumerDispatch();
            taskQueueProducer.publishToWorker(workerMessage);
            taskStateService.mark(task, TaskStatus.DISPATCHED, LocalDateTime.now().plus(properties.getExecutionTimeout()));
            log.info("task dispatch consumed, taskId={}, workflowInstanceId={}, nodeId={}",
                    taskId, task.getWorkflowInstanceId(), task.getNodeId());
        } catch (RuntimeException exception) {
            log.error("task dispatch consume failed, taskId={}", taskId, exception);
            retryManager.handleDispatchFailure(task, taskMessage, exception);
        }
    }

    @RabbitListener(queues = RabbitMqNames.TASK_DEAD_LETTER_QUEUE,
            autoStartup = "${aetherflow.task.consumer.dead-letter-enabled:true}")
    public void consumeDeadLetterTask(TaskMessageDTO taskMessage, Message rawMessage) {
        Long taskId = taskMessage == null ? null : taskMessage.getTaskId();
        String reason = String.valueOf(rawMessage.getMessageProperties().getHeaders().getOrDefault("taskFailureReason", "dead-letter"));
        taskStateService.findById(taskId).ifPresentOrElse(task -> {
            taskStateService.mark(task, TaskStatus.FAILED, null);
            log.warn("task dead-letter consumed, taskId={}, reason={}", taskId, reason);
        }, () -> log.warn("dead-letter task message has no task record, taskId={}, reason={}", taskId, reason));
    }
}
