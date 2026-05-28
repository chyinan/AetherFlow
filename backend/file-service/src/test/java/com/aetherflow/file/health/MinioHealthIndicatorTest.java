package com.aetherflow.file.health;

import com.aetherflow.file.model.MinioHealthView;
import com.aetherflow.file.service.MinioHealthService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MinioHealthIndicatorTest {

    @Test
    void healthShouldBeUpWhenMinioServiceIsReachable() {
        MinioHealthService minioHealthService = mock(MinioHealthService.class);
        when(minioHealthService.check()).thenReturn(new MinioHealthView("UP", "MinIO bucket reachable", 12L));

        Health health = new MinioHealthIndicator(minioHealthService).health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails())
                .containsEntry("status", "UP")
                .containsEntry("message", "MinIO bucket reachable")
                .containsEntry("latencyMs", 12L);
    }

    @Test
    void healthShouldBeDownWhenMinioServiceIsUnavailable() {
        MinioHealthService minioHealthService = mock(MinioHealthService.class);
        when(minioHealthService.check()).thenReturn(new MinioHealthView("DOWN", "MinIO unavailable", 1000L));

        Health health = new MinioHealthIndicator(minioHealthService).health();

        assertThat(health.getStatus()).isEqualTo(Status.DOWN);
        assertThat(health.getDetails())
                .containsEntry("status", "DOWN")
                .containsEntry("message", "MinIO unavailable")
                .containsEntry("latencyMs", 1000L);
    }
}
