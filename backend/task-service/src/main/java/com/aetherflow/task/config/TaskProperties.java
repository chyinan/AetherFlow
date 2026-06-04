package com.aetherflow.task.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

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
    private String internalToken = "aetherflow-task-internal-dev-token";
    private Scheduler scheduler = new Scheduler();
    private Consumer consumer = new Consumer();
    private Mq mq = new Mq();
    private QueueProtection queueProtection = new QueueProtection();
    private SentinelProtection sentinelProtection = new SentinelProtection();

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

    @Data
    public static class QueueProtection {
        private boolean enabled = true;
        private boolean failClosedOnMonitorError = false;
        private long busyDepthThreshold = 1000;
        private long recoveryDepthThreshold = 300;
        private long busyUnackedThreshold = 500;
        private long recoveryUnackedThreshold = 100;
        private boolean busyWhenNoConsumers = true;
        private Duration cacheTtl = Duration.ofSeconds(30);
        private long monitorIntervalMs = 10000;
        private ManagementApi managementApi = new ManagementApi();
        private List<String> monitorQueues = new ArrayList<>();
    }

    @Data
    public static class ManagementApi {
        private String baseUrl = "http://192.168.101.68:15672";
        private String username = "aetherflow";
        private String password = "aetherflow";
        private String virtualHost = "/";
        private Duration connectTimeout = Duration.ofSeconds(3);
    }

    @Data
    public static class SentinelProtection {
        private boolean enabled = true;
        private String dispatchResource = "task-service-ai-dispatch-create";
        private String consumerDispatchResource = "task-service-ai-consumer-dispatch";
        private double dispatchQps = 50.0D;
        private double consumerDispatchQps = 20.0D;
    }
}
