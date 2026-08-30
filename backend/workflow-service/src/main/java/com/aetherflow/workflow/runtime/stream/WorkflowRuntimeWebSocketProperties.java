package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.AssertTrue;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Data
@Validated
@ConfigurationProperties(prefix = "aetherflow.workflow.websocket")
public class WorkflowRuntimeWebSocketProperties {

    @NotBlank
    private String allowedOrigins = "http://localhost:3000,http://127.0.0.1:3000";
    private Duration streamTimeout = Duration.ofMinutes(5);
    private Duration pollInterval = Duration.ofSeconds(1);
    private Duration heartbeatInterval = Duration.ofSeconds(15);
    @Min(1)
    private int threadPoolSize = 8;
    @Min(1)
    private int maxConnections = 2_000;

    @AssertTrue(message = "workflow WebSocket durations must be positive and heartbeat must be shorter than stream timeout")
    public boolean isTimingValid() {
        return positive(streamTimeout)
                && positive(pollInterval)
                && positive(heartbeatInterval)
                && heartbeatInterval.compareTo(streamTimeout) < 0;
    }

    private boolean positive(Duration duration) {
        return duration != null && !duration.isZero() && !duration.isNegative();
    }
}
