package com.aetherflow.file.health;

import com.aetherflow.file.model.MinioHealthView;
import com.aetherflow.file.service.MinioHealthService;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

@Component("minio")
@RequiredArgsConstructor
public class MinioHealthIndicator implements HealthIndicator {

    private final MinioHealthService minioHealthService;

    @Override
    public Health health() {
        MinioHealthView health = minioHealthService.check();
        Health.Builder builder = "UP".equals(health.status()) ? Health.up() : Health.down();
        return builder
                .withDetail("status", health.status())
                .withDetail("message", health.message())
                .withDetail("latencyMs", health.latencyMs())
                .build();
    }
}
