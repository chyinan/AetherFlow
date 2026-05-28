package com.aetherflow.task.monitor;

import com.aetherflow.task.config.TaskProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QueueMonitorServiceTest {

    private final AtomicReference<List<QueueMetrics>> metricsRef = new AtomicReference<>();
    private TaskProperties properties;
    private StringRedisTemplate redisTemplate;
    private QueueMonitorService queueMonitorService;

    @BeforeEach
    void setUp() {
        properties = new TaskProperties();
        properties.getQueueProtection().setBusyDepthThreshold(1000);
        properties.getQueueProtection().setRecoveryDepthThreshold(300);
        properties.getQueueProtection().setBusyUnackedThreshold(500);
        properties.getQueueProtection().setRecoveryUnackedThreshold(100);
        properties.getQueueProtection().setMonitorQueues(List.of("aetherflow.ai.task.queue"));

        redisTemplate = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get(QueueMonitorService.REJECTED_TASK_COUNT_KEY)).thenReturn(null);

        QueueMetricsClient metricsClient = queueName -> metricsRef.get().stream()
                .filter(metrics -> metrics.getQueueName().equals(queueName))
                .findFirst()
                .orElse(new QueueMetrics(queueName, 0, 0, 0, 1));
        queueMonitorService = new QueueMonitorService(metricsClient, redisTemplate, new ObjectMapper().findAndRegisterModules(), properties);
    }

    @Test
    void marksBusyWhenQueueDepthExceedsThresholdAndCachesState() {
        metricsRef.set(List.of(new QueueMetrics("aetherflow.ai.task.queue", 1200, 20, 1220, 2)));

        QueueHealthSnapshot snapshot = queueMonitorService.refreshNow();

        assertThat(snapshot.isBusy()).isTrue();
        assertThat(snapshot.getStatus()).isEqualTo(QueueBusyStatus.BUSY);
        assertThat(snapshot.getTotalMessages()).isEqualTo(1220);
        verify(redisTemplate.opsForValue()).set(eq(QueueMonitorService.QUEUE_STATUS_KEY), eq("BUSY"), any());
        verify(redisTemplate.opsForValue()).set(eq(QueueMonitorService.AI_SERVICE_BUSY_KEY), eq("true"), any());
    }

    @Test
    void keepsBusyUntilRecoveryLowWatermarkIsReached() {
        metricsRef.set(List.of(new QueueMetrics("aetherflow.ai.task.queue", 1200, 20, 1220, 2)));
        assertThat(queueMonitorService.refreshNow().isBusy()).isTrue();

        metricsRef.set(List.of(new QueueMetrics("aetherflow.ai.task.queue", 500, 20, 520, 2)));
        QueueHealthSnapshot stillBusy = queueMonitorService.refreshNow();

        assertThat(stillBusy.isBusy()).isTrue();

        metricsRef.set(List.of(new QueueMetrics("aetherflow.ai.task.queue", 100, 10, 110, 2)));
        QueueHealthSnapshot recovered = queueMonitorService.refreshNow();

        assertThat(recovered.isBusy()).isFalse();
        assertThat(recovered.getStatus()).isEqualTo(QueueBusyStatus.NORMAL);
    }

    @Test
    void fallsBackToNormalSnapshotWhenMetricsAreUnavailableBeforeFirstSuccessfulCheck() {
        QueueMonitorService failingMonitor = monitorWithState(new AtomicReference<>());

        QueueHealthSnapshot snapshot = failingMonitor.refreshNow();

        assertThat(snapshot.getStatus()).isEqualTo(QueueBusyStatus.NORMAL);
        assertThat(snapshot.isBusy()).isFalse();
        assertThat(snapshot.getReason()).contains("queue metrics unavailable");
    }

    @Test
    void keepsBusySnapshotWhenMetricsFailAfterBusyState() {
        AtomicReference<List<QueueMetrics>> state = new AtomicReference<>(
                List.of(new QueueMetrics("aetherflow.ai.task.queue", 1200, 20, 1220, 2)));
        QueueMonitorService failingMonitor = monitorWithState(state);

        assertThat(failingMonitor.refreshNow().isBusy()).isTrue();
        state.set(null);

        QueueHealthSnapshot snapshot = failingMonitor.refreshNow();

        assertThat(snapshot.getStatus()).isEqualTo(QueueBusyStatus.BUSY);
        assertThat(snapshot.isBusy()).isTrue();
        assertThat(snapshot.getReason()).contains("queue metrics unavailable");
    }

    @Test
    void rejectedTaskCountDoesNotMoveBackwardsWhenRedisValueIsStale() {
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.increment(QueueMonitorService.REJECTED_TASK_COUNT_KEY)).thenReturn(null);
        when(valueOperations.get(QueueMonitorService.REJECTED_TASK_COUNT_KEY)).thenReturn(null, "0");

        long rejectedAfterRedisFailure = queueMonitorService.incrementRejectedTask();
        long rejectedAfterRedisRecovery = queueMonitorService.rejectedTaskCount();

        assertThat(rejectedAfterRedisFailure).isEqualTo(1L);
        assertThat(rejectedAfterRedisRecovery).isEqualTo(1L);
    }

    private QueueMonitorService monitorWithState(AtomicReference<List<QueueMetrics>> state) {
        QueueMetricsClient metricsClient = queueName -> {
            List<QueueMetrics> current = state.get();
            if (current == null) {
                throw new IllegalStateException("rabbitmq management api unavailable");
            }
            return current.stream()
                .filter(metrics -> metrics.getQueueName().equals(queueName))
                .findFirst()
                .orElse(new QueueMetrics(queueName, 0, 0, 0, 1));
        };
        return new QueueMonitorService(metricsClient, redisTemplate, new ObjectMapper().findAndRegisterModules(), properties);
    }
}
