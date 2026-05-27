package com.aetherflow.task.config;

import com.aetherflow.common.core.RabbitMqNames;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration
@EnableConfigurationProperties(TaskProperties.class)
public class RabbitMqConfig {

    @Bean
    public DirectExchange taskExchange() {
        return new DirectExchange(RabbitMqNames.TASK_EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange taskDeadLetterExchange() {
        return new DirectExchange(RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE, true, false);
    }

    @Bean
    public DirectExchange taskDispatchExchange(TaskProperties properties) {
        return new DirectExchange(properties.getMq().getDispatchExchange(), true, false);
    }

    @Bean
    public Queue taskDispatchQueue(TaskProperties properties) {
        return QueueBuilder.durable(properties.getMq().getDispatchQueue())
                .withArgument("x-dead-letter-exchange", RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitMqNames.TASK_DEAD_LETTER_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue aiTaskQueue() {
        return QueueBuilder.durable(RabbitMqNames.AI_TASK_QUEUE)
                .withArgument("x-dead-letter-exchange", RabbitMqNames.TASK_DEAD_LETTER_EXCHANGE)
                .withArgument("x-dead-letter-routing-key", RabbitMqNames.TASK_DEAD_LETTER_ROUTING_KEY)
                .build();
    }

    @Bean
    public Queue taskDeadLetterQueue() {
        return QueueBuilder.durable(RabbitMqNames.TASK_DEAD_LETTER_QUEUE).build();
    }

    @Bean
    public Binding aiTaskBinding(Queue aiTaskQueue, DirectExchange taskExchange) {
        return BindingBuilder.bind(aiTaskQueue)
                .to(taskExchange)
                .with(RabbitMqNames.AI_TASK_ROUTING_KEY);
    }

    @Bean
    public Binding taskDispatchBinding(Queue taskDispatchQueue,
                                       DirectExchange taskDispatchExchange,
                                       TaskProperties properties) {
        return BindingBuilder.bind(taskDispatchQueue)
                .to(taskDispatchExchange)
                .with(properties.getMq().getDispatchRoutingKey());
    }

    @Bean
    public Binding taskDeadLetterBinding(Queue taskDeadLetterQueue, DirectExchange taskDeadLetterExchange) {
        return BindingBuilder.bind(taskDeadLetterQueue)
                .to(taskDeadLetterExchange)
                .with(RabbitMqNames.TASK_DEAD_LETTER_ROUTING_KEY);
    }

    @Bean
    public Jackson2JsonMessageConverter jackson2JsonMessageConverter(ObjectMapper objectMapper) {
        return new Jackson2JsonMessageConverter(objectMapper);
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory,
                                         Jackson2JsonMessageConverter messageConverter) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(messageConverter);
        rabbitTemplate.setMandatory(true);
        rabbitTemplate.setReturnsCallback(returned -> log.error(
                "rabbitmq returned message, exchange={}, routingKey={}, replyCode={}, replyText={}",
                returned.getExchange(),
                returned.getRoutingKey(),
                returned.getReplyCode(),
                returned.getReplyText()));
        return rabbitTemplate;
    }
}
