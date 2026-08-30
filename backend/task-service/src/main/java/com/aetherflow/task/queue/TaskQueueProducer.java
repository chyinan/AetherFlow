package com.aetherflow.task.queue;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskQueueProducer {

    private final RabbitTemplate rabbitTemplate;
    private final TaskProperties properties;

    @org.springframework.beans.factory.annotation.Value("${aetherflow.task.publisher-confirm-timeout:5s}")
    private Duration publisherConfirmTimeout = Duration.ofSeconds(5);

    public void publishForDispatch(TaskMessageDTO taskMessage) {
        TaskProperties.Mq mq = properties.getMq();
        publish(mq.getDispatchExchange(), mq.getDispatchRoutingKey(), taskMessage, "dispatch", null);
    }

    public void publishToWorker(TaskMessageDTO taskMessage) {
        publish(RabbitMqNames.TASK_EXCHANGE, RabbitMqNames.AI_TASK_ROUTING_KEY, taskMessage, "worker", null);
    }

    public void publishToDeadLetter(TaskMessageDTO taskMessage, String reason) {
        publish(RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE,
                RabbitMqNames.TASK_DEAD_LETTER_ROUTING_KEY,
                taskMessage,
                "dead-letter",
                reason);
    }

    private void publish(String exchange,
                         String routingKey,
                         TaskMessageDTO taskMessage,
                         String channel,
                         String reason) {
        try {
            CorrelationData correlationData = new CorrelationData(
                    "task:" + taskMessage.getTaskId() + ":" + channel);
            rabbitTemplate.convertAndSend(exchange, routingKey, taskMessage,
                    messagePostProcessor(taskMessage, channel, reason), correlationData);
            awaitConfirm(correlationData);
            log.info("task message published, taskId={}, channel={}, exchange={}, routingKey={}",
                    taskMessage.getTaskId(), channel, exchange, routingKey);
        } catch (AmqpException | IllegalStateException exception) {
            log.error("task message publish failed, taskId={}, channel={}, exchange={}, routingKey={}",
                    taskMessage.getTaskId(), channel, exchange, routingKey, exception);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "rabbitmq task publish failed");
        }
    }

    private void awaitConfirm(CorrelationData correlationData) {
        if (correlationData == null || correlationData.getFuture() == null) {
            return;
        }
        try {
            CorrelationData.Confirm confirm = correlationData.getFuture().get(
                    Math.max(1L, publisherConfirmTimeout.toMillis()), TimeUnit.MILLISECONDS);
            if (confirm == null || !confirm.isAck()) {
                throw new IllegalStateException("task message broker confirmation was negative");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("task message broker confirmation interrupted", exception);
        } catch (TimeoutException exception) {
            throw new IllegalStateException("task message broker confirmation timed out", exception);
        } catch (java.util.concurrent.ExecutionException exception) {
            throw new IllegalStateException("task message broker confirmation failed", exception.getCause());
        }
    }

    private MessagePostProcessor messagePostProcessor(TaskMessageDTO taskMessage, String channel, String reason) {
        return message -> applyMessageProperties(message, taskMessage, channel, reason);
    }

    private Message applyMessageProperties(Message message,
                                           TaskMessageDTO taskMessage,
                                           String channel,
                                           String reason) {
        message.getMessageProperties().setMessageId("task-" + taskMessage.getTaskId() + "-" + UUID.randomUUID());
        message.getMessageProperties().setHeader("taskId", taskMessage.getTaskId());
        message.getMessageProperties().setHeader("X-Trace-Id", taskMessage.getTraceId());
        message.getMessageProperties().setHeader("taskChannel", channel);
        if (reason != null && !reason.isBlank()) {
            message.getMessageProperties().setHeader("taskFailureReason", reason);
        }
        return message;
    }
}
