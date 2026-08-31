package com.aetherflow.ai.config;

// pattern: Imperative Shell

import com.aetherflow.common.core.RabbitMqNames;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import lombok.extern.slf4j.Slf4j;

@Slf4j
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
    public DirectExchange aiTaskRetryExchange() {
        return new DirectExchange(RabbitMqNames.AI_TASK_RETRY_EXCHANGE, true, false);
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
    public Queue aiTaskRetryShortQueue() {
        return retryQueue(RabbitMqNames.AI_TASK_RETRY_SHORT_QUEUE, 5_000L);
    }

    @Bean
    public Queue aiTaskRetryMediumQueue() {
        return retryQueue(RabbitMqNames.AI_TASK_RETRY_MEDIUM_QUEUE, 30_000L);
    }

    @Bean
    public Queue aiTaskRetryLongQueue() {
        return retryQueue(RabbitMqNames.AI_TASK_RETRY_LONG_QUEUE, 120_000L);
    }

    @Bean
    public Binding aiTaskRetryShortBinding(Queue aiTaskRetryShortQueue, DirectExchange aiTaskRetryExchange) {
        return BindingBuilder.bind(aiTaskRetryShortQueue).to(aiTaskRetryExchange)
                .with(RabbitMqNames.AI_TASK_RETRY_SHORT_ROUTING_KEY);
    }

    @Bean
    public Binding aiTaskRetryMediumBinding(Queue aiTaskRetryMediumQueue, DirectExchange aiTaskRetryExchange) {
        return BindingBuilder.bind(aiTaskRetryMediumQueue).to(aiTaskRetryExchange)
                .with(RabbitMqNames.AI_TASK_RETRY_MEDIUM_ROUTING_KEY);
    }

    @Bean
    public Binding aiTaskRetryLongBinding(Queue aiTaskRetryLongQueue, DirectExchange aiTaskRetryExchange) {
        return BindingBuilder.bind(aiTaskRetryLongQueue).to(aiTaskRetryExchange)
                .with(RabbitMqNames.AI_TASK_RETRY_LONG_ROUTING_KEY);
    }

    private Queue retryQueue(String name, long ttlMillis) {
        return QueueBuilder.durable(name)
                .withArgument("x-message-ttl", ttlMillis)
                .withArgument("x-dead-letter-exchange", RabbitMqNames.TASK_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitMqNames.AI_TASK_ROUTING_KEY)
                .build();
    }

    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         Jackson2JsonMessageConverter messageConverter) {
        if (connectionFactory instanceof CachingConnectionFactory cachingConnectionFactory) {
            cachingConnectionFactory.setPublisherConfirmType(CachingConnectionFactory.ConfirmType.CORRELATED);
            cachingConnectionFactory.setPublisherReturns(true);
        }
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(messageConverter);
        rabbitTemplate.setMandatory(true);
        rabbitTemplate.setReturnsCallback(returned -> log.error(
                "rabbitmq returned AI notification, exchange={}, routingKey={}, replyCode={}, replyText={}",
                returned.getExchange(), returned.getRoutingKey(), returned.getReplyCode(), returned.getReplyText()));
        rabbitTemplate.setObservationEnabled(true);
        return rabbitTemplate;
    }
}
