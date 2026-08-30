package com.aetherflow.ai.config;

// pattern: Imperative Shell
import lombok.Data;
import jakarta.validation.constraints.AssertTrue;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

@Data
@Component
@Validated
@ConfigurationProperties(prefix = "aetherflow.ai.image")
public class ImageProviderProperties {

    private StableDiffusion stableDiffusion = new StableDiffusion();
    private Comfy comfy = new Comfy();
    private Duration defaultTimeout = Duration.ofMinutes(5);
    private Duration healthTimeout = Duration.ofSeconds(2);
    private Duration healthCacheTtl = Duration.ofSeconds(10);

    @AssertTrue(message = "image provider health timeout must be positive and no greater than 30 seconds; cache TTL must be positive")
    public boolean isHealthProbeTimingValid() {
        return positive(healthTimeout)
                && healthTimeout.compareTo(Duration.ofSeconds(30)) <= 0
                && positive(healthCacheTtl);
    }

    private boolean positive(Duration duration) {
        return duration != null && !duration.isZero() && !duration.isNegative();
    }

    @Data
    public static class StableDiffusion {
        private boolean enabled = false;
        private String baseUrl = "http://127.0.0.1:7860";
    }

    @Data
    public static class Comfy {
        private boolean enabled = false;
        private String baseUrl = "http://127.0.0.1:8188";
        private Duration pollInterval = Duration.ofSeconds(1);
        private Duration maxWait = Duration.ofMinutes(10);
    }
}
