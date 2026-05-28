package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventPublisher;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

@RequiredArgsConstructor
public class RabbitRuntimeEventPublisher implements RuntimeEventPublisher {

    private final RabbitTemplate rabbitTemplate;
    private final WorkflowRuntimeProperties properties;

    @Override
    public void publish(RuntimeEvent event) {
        WorkflowRuntimeProperties.Events.Mq mq = properties.getEvents().getMq();
        if (event == null || rabbitTemplate == null || !mq.isEnabled()) {
            return;
        }
        if (mq.getExchange() == null || mq.getExchange().isBlank()
                || mq.getRoutingKey() == null || mq.getRoutingKey().isBlank()) {
            return;
        }
        rabbitTemplate.convertAndSend(mq.getExchange(), mq.getRoutingKey(), event);
    }
}
