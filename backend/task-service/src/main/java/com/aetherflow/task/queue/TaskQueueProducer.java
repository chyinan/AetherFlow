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
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Slf4j
@Component
@RequiredArgsConstructor
public class TaskQueueProducer {

    private final RabbitTemplate rabbitTemplate;
    private final TaskProperties properties;

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
            rabbitTemplate.convertAndSend(exchange, routingKey, taskMessage, messagePostProcessor(taskMessage, channel, reason));
            log.info("task message published, taskId={}, channel={}, exchange={}, routingKey={}",
                    taskMessage.getTaskId(), channel, exchange, routingKey);
        } catch (AmqpException exception) {
            log.error("task message publish failed, taskId={}, channel={}, exchange={}, routingKey={}",
                    taskMessage.getTaskId(), channel, exchange, routingKey, exception);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "rabbitmq task publish failed");
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
        message.getMessageProperties().setHeader("taskChannel", channel);
        if (reason != null && !reason.isBlank()) {
            message.getMessageProperties().setHeader("taskFailureReason", reason);
        }
        return message;
    }
}
