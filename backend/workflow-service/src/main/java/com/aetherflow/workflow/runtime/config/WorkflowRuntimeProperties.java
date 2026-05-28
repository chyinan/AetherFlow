package com.aetherflow.workflow.runtime.config;

import com.aetherflow.workflow.runtime.api.RetryPolicy;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@Data
@ConfigurationProperties(prefix = "aetherflow.workflow.runtime")
public class WorkflowRuntimeProperties {

    private Retry retry = new Retry();
    private Events events = new Events();
    private Observability observability = new Observability();
    private Recovery recovery = new Recovery();
    private Lock lock = new Lock();

    @Data
    public static class Retry {
        private int maxAttempts = 3;
        private Duration initialDelay = Duration.ZERO;
        private double backoffMultiplier = 2.0D;
        private Duration maxDelay = Duration.ofSeconds(30);

        public RetryPolicy toRetryPolicy() {
            return RetryPolicy.of(maxAttempts, initialDelay, backoffMultiplier, maxDelay);
        }
    }

    @Data
    public static class Events {
        private Mq mq = new Mq();

        @Data
        public static class Mq {
            private boolean enabled = false;
            private String exchange = "";
            private String routingKey = "";
        }
    }

    @Data
    public static class Observability {
        private int maxEventsPerWorkflow = 200;
    }

    @Data
    public static class Recovery {
        private boolean enabled = true;
        private int scanLimit = 100;
    }

    @Data
    public static class Lock {
        private boolean enabled = true;
        private Duration ttl = Duration.ofSeconds(60);
        private String keyPrefix = "aetherflow:workflow:runtime:lock:";
    }
}
