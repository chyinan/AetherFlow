package com.aetherflow.ai.task;

// pattern: Imperative Shell

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
public class AiTaskDeferredRetryPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void defer(TaskMessageDTO message, Duration retryAfter) {
        if (message == null || message.getTaskId() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "deferred AI task message is invalid");
        }
        CorrelationData correlationData = new CorrelationData(
                "ai-lease-retry:" + message.getTaskId() + ":" + UUID.randomUUID());
        try {
            rabbitTemplate.convertAndSend(
                    RabbitMqNames.AI_TASK_RETRY_EXCHANGE,
                    routingKey(retryAfter),
                    message,
                    correlationData);
            if (correlationData.getFuture() == null) {
                throw new IllegalStateException("publisher confirms are required for deferred AI task");
            }
            CorrelationData.Confirm confirm = correlationData.getFuture().get(5, TimeUnit.SECONDS);
            if (confirm == null || !confirm.isAck() || correlationData.getReturned() != null) {
                throw new IllegalStateException("broker rejected deferred AI task");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "deferred AI task publish interrupted");
        } catch (Exception exception) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                    "deferred AI task publish failed");
        }
    }

    private String routingKey(Duration retryAfter) {
        Duration delay = retryAfter == null || retryAfter.isNegative() || retryAfter.isZero()
                ? Duration.ofSeconds(1)
                : retryAfter;
        if (delay.compareTo(Duration.ofSeconds(5)) <= 0) {
            return RabbitMqNames.AI_TASK_RETRY_SHORT_ROUTING_KEY;
        }
        if (delay.compareTo(Duration.ofSeconds(30)) <= 0) {
            return RabbitMqNames.AI_TASK_RETRY_MEDIUM_ROUTING_KEY;
        }
        return RabbitMqNames.AI_TASK_RETRY_LONG_ROUTING_KEY;
    }
}
