package com.aetherflow.ai.config;

import com.aetherflow.common.core.RabbitMqNames;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiRabbitConfig {

    @Bean
    public DirectExchange taskExchange() {
        return new DirectExchange(RabbitMqNames.TASK_EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange taskDeadLetterExchange() {
        return new DirectExchange(RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange notifyExchange() {
        return new DirectExchange(RabbitMqNames.NOTIFY_EXCHANGE, true, false);
    }

    @Bean
    public Queue aiTaskQueue() {
        return QueueBuilder.durable(RabbitMqNames.AI_TASK_QUEUE)
                .withArgument("x-dead-letter-exchange", RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitMqNames.TASK_DEAD_LETTER_ROUTING_KEY)
                .build();
    }

    @Bean
    public Binding aiTaskBinding(Queue aiTaskQueue, DirectExchange taskExchange) {
        return BindingBuilder.bind(aiTaskQueue)
                .to(taskExchange)
                .with(RabbitMqNames.AI_TASK_ROUTING_KEY);
    }

    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         Jackson2JsonMessageConverter messageConverter) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(messageConverter);
        return rabbitTemplate;
    }
}
