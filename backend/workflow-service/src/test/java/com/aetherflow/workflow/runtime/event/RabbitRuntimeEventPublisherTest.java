package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.time.Instant;
import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class RabbitRuntimeEventPublisherTest {

    @Test
    void publishesRuntimeEventWhenMqPublishingIsEnabled() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        properties.getEvents().getMq().setEnabled(true);
        properties.getEvents().getMq().setExchange("runtime.exchange");
        properties.getEvents().getMq().setRoutingKey("runtime.event");
        RabbitRuntimeEventPublisher publisher = new RabbitRuntimeEventPublisher(rabbitTemplate, properties);
        RuntimeEvent event = event();

        publisher.publish(event);

        verify(rabbitTemplate).convertAndSend("runtime.exchange", "runtime.event", event);
    }

    @Test
    void skipsRuntimeEventWhenMqPublishingIsDisabled() {
        RabbitTemplate rabbitTemplate = mock(RabbitTemplate.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        RabbitRuntimeEventPublisher publisher = new RabbitRuntimeEventPublisher(rabbitTemplate, properties);

        publisher.publish(event());

        verifyNoInteractions(rabbitTemplate);
    }

    private static RuntimeEvent event() {
        return RuntimeEvent.of(RuntimeEventType.WORKFLOW_STARTED, "workflow-1", "trace-1", "task-1",
                null, RuntimeState.RUNNING, Instant.parse("2026-05-28T09:00:00Z"), Map.of());
    }
}
