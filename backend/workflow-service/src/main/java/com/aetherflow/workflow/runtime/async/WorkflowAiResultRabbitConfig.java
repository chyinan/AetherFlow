package com.aetherflow.workflow.runtime.async;

// pattern: Imperative Shell

import com.aetherflow.common.core.RabbitMqNames;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// pattern: Imperative Shell
@Configuration
public class WorkflowAiResultRabbitConfig {

    @Bean
    public DirectExchange workflowNotifyExchange() {
        return new DirectExchange(RabbitMqNames.NOTIFY_EXCHANGE, true, false);
    }

    @Bean
    public Queue workflowAiResultQueue() {
        return QueueBuilder.durable(RabbitMqNames.WORKFLOW_AI_RESULT_QUEUE)
                .withArgument("x-queue-type", "quorum")
                .build();
    }

    @Bean
    public Binding workflowAiResultBinding(Queue workflowAiResultQueue,
                                           DirectExchange workflowNotifyExchange) {
        return BindingBuilder.bind(workflowAiResultQueue)
                .to(workflowNotifyExchange)
                .with(RabbitMqNames.NOTIFY_ROUTING_KEY);
    }
}
