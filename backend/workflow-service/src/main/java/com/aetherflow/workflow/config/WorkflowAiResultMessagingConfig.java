package com.aetherflow.workflow.config;

// pattern: Imperative Shell

import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 为 AI 任务结果监听器单独提供 JSON 转换能力。
 *
 * <p>workflow-service 只声明了一个 @RabbitListener（AI 结果回传），默认容器工厂用的是
 * SimpleMessageConverter，收到 JSON 消息时得到 byte[]，向 NotifyMessageDTO 转换会抛
 * MessageConversionException，消息被直接丢弃——表现为 AI 任务结束（成功或失败）后
 * 工作流实例一直卡在 WAITING。
 *
 * <p>这里只给该监听器配置 Jackson 转换器，避免改动全局 RabbitTemplate 序列化方式而
 * 影响其它服务的消费。
 */
@Configuration
public class WorkflowAiResultMessagingConfig {

    public static final String AI_RESULT_LISTENER_FACTORY = "aiResultListenerContainerFactory";

    @Bean(AI_RESULT_LISTENER_FACTORY)
    public SimpleRabbitListenerContainerFactory aiResultListenerContainerFactory(
            ConnectionFactory connectionFactory) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setMessageConverter(new Jackson2JsonMessageConverter());
        return factory;
    }
}
