package com.aetherflow.task.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "aetherflow.task")
public class TaskProperties {

    private int maxRetries = 3;
    private int scanLimit = 100;
    private Duration redisTtl = Duration.ofHours(2);
    private Duration dispatchTimeout = Duration.ofMinutes(5);
    private Duration executionTimeout = Duration.ofMinutes(30);
    private Duration retryInitialInterval = Duration.ofMinutes(1);
    private Duration retryMaxInterval = Duration.ofMinutes(10);
    private Scheduler scheduler = new Scheduler();
    private Consumer consumer = new Consumer();
    private Mq mq = new Mq();

    @Data
    public static class Scheduler {
        private boolean enabled = true;
        private Duration retryFixedDelay = Duration.ofMinutes(1);
        private Duration timeoutFixedDelay = Duration.ofMinutes(1);
    }

    @Data
    public static class Consumer {
        private boolean dispatchEnabled = true;
        private boolean deadLetterEnabled = true;
    }

    @Data
    public static class Mq {
        private String dispatchExchange = "aetherflow.task.scheduler.exchange";
        private String dispatchQueue = "aetherflow.task.scheduler.queue";
        private String dispatchRoutingKey = "task.schedule.dispatch";
    }
}
