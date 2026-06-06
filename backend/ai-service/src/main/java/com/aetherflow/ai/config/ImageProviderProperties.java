package com.aetherflow.ai.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Data
@Component
@ConfigurationProperties(prefix = "aetherflow.ai.image")
public class ImageProviderProperties {

    private StableDiffusion stableDiffusion = new StableDiffusion();
    private Comfy comfy = new Comfy();
    private Duration defaultTimeout = Duration.ofMinutes(5);

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
