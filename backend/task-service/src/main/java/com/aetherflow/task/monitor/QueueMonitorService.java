package com.aetherflow.task.monitor;

import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.task.config.TaskProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
@RequiredArgsConstructor
public class QueueMonitorService {

    public static final String QUEUE_STATUS_KEY = "aetherflow:task:queue:status";
    public static final String QUEUE_HEALTH_KEY = "aetherflow:task:queue:health";
    public static final String AI_SERVICE_BUSY_KEY = "aetherflow:task:ai-service:busy";
    public static final String REJECTED_TASK_COUNT_KEY = "aetherflow:task:queue:rejected-count";

    private final QueueMetricsClient queueMetricsClient;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final TaskProperties properties;
    private final AtomicReference<QueueHealthSnapshot> latestSnapshot =
            new AtomicReference<>(QueueHealthSnapshot.unknown("queue health not initialized", false));
    private final AtomicLong localRejectedTaskCount = new AtomicLong();

    @Scheduled(fixedDelayString = "${aetherflow.task.queue-protection.monitor-interval-ms:10000}")
    public void scheduledMonitorQueues() {
        if (!properties.getQueueProtection().isEnabled()) {
            return;
        }
        refreshNow();
    }

    public QueueHealthSnapshot refreshNow() {
        TaskProperties.QueueProtection protection = properties.getQueueProtection();
        if (!protection.isEnabled()) {
            QueueHealthSnapshot snapshot = normalSnapshot("queue protection disabled", List.of());
            updateSnapshot(snapshot);
            return snapshot;
        }

        try {
            List<QueueMetrics> queueMetrics = monitorQueues().stream()
                    .map(queueMetricsClient::fetch)
                    .toList();
            QueueHealthSnapshot snapshot = buildSnapshot(queueMetrics);
            updateSnapshot(snapshot);
            return snapshot;
        } catch (RuntimeException exception) {
            QueueHealthSnapshot previous = latestSnapshot.get();
            boolean previousBusy = previous.isBusy();
            boolean busyOnMonitorError = protection.isFailClosedOnMonitorError() || previousBusy;
            QueueHealthSnapshot snapshot = monitorErrorSnapshot(previous, exception, busyOnMonitorError);
            updateSnapshot(snapshot);
            log.error("queue monitor refresh failed, failClosed={}, previousBusy={}, currentBusy={}",
                    protection.isFailClosedOnMonitorError(),
                    previousBusy,
                    snapshot.isBusy(),
                    exception);
            return snapshot;
        }
    }

    public QueueHealthSnapshot currentSnapshot() {
        QueueHealthSnapshot snapshot = latestSnapshot.get();
        QueueHealthSnapshot copy = copy(snapshot);
        copy.setRejectedTaskCount(rejectedTaskCount());
        return copy;
    }

    public boolean busy() {
        return latestSnapshot.get().isBusy();
    }

    public long incrementRejectedTask() {
        try {
            Long count = redisTemplate.opsForValue().increment(REJECTED_TASK_COUNT_KEY);
            if (count != null) {
                return nextRejectedTaskCount(count);
            }
        } catch (DataAccessException exception) {
            log.warn("redis rejected task counter increment failed", exception);
        }
        return localRejectedTaskCount.incrementAndGet();
    }

    public long rejectedTaskCount() {
        try {
            String value = redisTemplate.opsForValue().get(REJECTED_TASK_COUNT_KEY);
            if (value != null && !value.isBlank()) {
                long count = Long.parseLong(value);
                return syncRejectedTaskCount(count);
            }
        } catch (RuntimeException exception) {
            log.warn("redis rejected task counter read failed", exception);
        }
        return localRejectedTaskCount.get();
    }

    private List<String> monitorQueues() {
        Set<String> queues = new LinkedHashSet<>(properties.getQueueProtection().getMonitorQueues());
        queues.add(properties.getMq().getDispatchQueue());
        queues.add(RabbitMqNames.AI_TASK_QUEUE);
        return queues.stream()
                .filter(queue -> queue != null && !queue.isBlank())
                .toList();
    }

    private QueueHealthSnapshot buildSnapshot(List<QueueMetrics> queueMetrics) {
        long readyMessages = queueMetrics.stream().mapToLong(QueueMetrics::getReadyMessages).sum();
        long unackedMessages = queueMetrics.stream().mapToLong(QueueMetrics::getUnackedMessages).sum();
        long totalMessages = queueMetrics.stream().mapToLong(QueueMetrics::getTotalMessages).sum();
        int consumers = queueMetrics.stream().mapToInt(QueueMetrics::getConsumers).sum();

        QueueHealthSnapshot previous = latestSnapshot.get();
        boolean busyCondition = busyCondition(totalMessages, unackedMessages, queueMetrics);
        boolean recovered = recovered(totalMessages, unackedMessages, queueMetrics);
        boolean busy = previous.isBusy() ? !recovered : busyCondition;

        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setQueues(new ArrayList<>(queueMetrics));
        snapshot.setReadyMessages(readyMessages);
        snapshot.setUnackedMessages(unackedMessages);
        snapshot.setTotalMessages(totalMessages);
        snapshot.setConsumers(consumers);
        snapshot.setBusy(busy);
        snapshot.setStatus(busy ? QueueBusyStatus.BUSY : QueueBusyStatus.NORMAL);
        snapshot.setReason(reason(busy, totalMessages, unackedMessages, consumers));
        snapshot.setRejectedTaskCount(rejectedTaskCount());
        snapshot.setCheckedAt(OffsetDateTime.now());
        return snapshot;
    }

    private boolean busyCondition(long totalMessages, long unackedMessages, List<QueueMetrics> queueMetrics) {
        TaskProperties.QueueProtection protection = properties.getQueueProtection();
        if (totalMessages >= protection.getBusyDepthThreshold()) {
            return true;
        }
        if (unackedMessages >= protection.getBusyUnackedThreshold()) {
            return true;
        }
        return protection.isBusyWhenNoConsumers()
                && queueMetrics.stream().anyMatch(metrics -> metrics.getTotalMessages() > 0 && metrics.getConsumers() == 0);
    }

    private boolean recovered(long totalMessages, long unackedMessages, List<QueueMetrics> queueMetrics) {
        TaskProperties.QueueProtection protection = properties.getQueueProtection();
        boolean consumerRecovered = !protection.isBusyWhenNoConsumers()
                || queueMetrics.stream().noneMatch(metrics -> metrics.getTotalMessages() > 0 && metrics.getConsumers() == 0);
        return totalMessages <= protection.getRecoveryDepthThreshold()
                && unackedMessages <= protection.getRecoveryUnackedThreshold()
                && consumerRecovered;
    }

    private String reason(boolean busy, long totalMessages, long unackedMessages, int consumers) {
        if (!busy) {
            return "queue depth is healthy";
        }
        return "queue backpressure active, totalMessages=" + totalMessages
                + ", unackedMessages=" + unackedMessages
                + ", consumers=" + consumers;
    }

    private QueueHealthSnapshot normalSnapshot(String reason, List<QueueMetrics> queueMetrics) {
        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setStatus(QueueBusyStatus.NORMAL);
        snapshot.setBusy(false);
        snapshot.setReason(reason);
        snapshot.setQueues(new ArrayList<>(queueMetrics));
        snapshot.setCheckedAt(OffsetDateTime.now());
        snapshot.setRejectedTaskCount(rejectedTaskCount());
        return snapshot;
    }

    private QueueHealthSnapshot monitorErrorSnapshot(QueueHealthSnapshot previous,
                                                     RuntimeException exception,
                                                     boolean busy) {
        QueueHealthSnapshot snapshot = previous.getStatus() == QueueBusyStatus.UNKNOWN
                ? new QueueHealthSnapshot()
                : copy(previous);
        snapshot.setStatus(busy ? QueueBusyStatus.BUSY : QueueBusyStatus.NORMAL);
        snapshot.setBusy(busy);
        snapshot.setReason("queue metrics unavailable: " + errorMessage(exception));
        snapshot.setRejectedTaskCount(rejectedTaskCount());
        snapshot.setCheckedAt(OffsetDateTime.now());
        return snapshot;
    }

    private String errorMessage(RuntimeException exception) {
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }

    private long nextRejectedTaskCount(long redisCount) {
        return localRejectedTaskCount.updateAndGet(localCount -> Math.max(localCount + 1, redisCount));
    }

    private long syncRejectedTaskCount(long redisCount) {
        return localRejectedTaskCount.updateAndGet(localCount -> Math.max(localCount, redisCount));
    }

    private void updateSnapshot(QueueHealthSnapshot snapshot) {
        QueueHealthSnapshot previous = latestSnapshot.getAndSet(copy(snapshot));
        persistSnapshot(snapshot);
        if (!previous.isBusy() && snapshot.isBusy()) {
            log.warn("queue backpressure enabled, status={}, reason={}", snapshot.getStatus(), snapshot.getReason());
        } else if (previous.isBusy() && !snapshot.isBusy()) {
            log.info("queue backpressure recovered, status={}, reason={}", snapshot.getStatus(), snapshot.getReason());
        } else {
            log.debug("queue monitor refreshed, status={}, totalMessages={}, unackedMessages={}, consumers={}",
                    snapshot.getStatus(), snapshot.getTotalMessages(), snapshot.getUnackedMessages(), snapshot.getConsumers());
        }
    }

    private void persistSnapshot(QueueHealthSnapshot snapshot) {
        try {
            TaskProperties.QueueProtection protection = properties.getQueueProtection();
            redisTemplate.opsForValue().set(QUEUE_STATUS_KEY, snapshot.getStatus().name(), protection.getCacheTtl());
            redisTemplate.opsForValue().set(AI_SERVICE_BUSY_KEY, Boolean.toString(snapshot.isBusy()), protection.getCacheTtl());
            redisTemplate.opsForValue().set(QUEUE_HEALTH_KEY, writeJson(snapshot), protection.getCacheTtl());
        } catch (DataAccessException exception) {
            log.warn("redis queue health cache update failed", exception);
        }
    }

    private String writeJson(QueueHealthSnapshot snapshot) {
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (JsonProcessingException exception) {
            log.warn("queue health snapshot serialization failed", exception);
            return "{}";
        }
    }

    private QueueHealthSnapshot copy(QueueHealthSnapshot source) {
        QueueHealthSnapshot copy = new QueueHealthSnapshot();
        copy.setStatus(source.getStatus());
        copy.setBusy(source.isBusy());
        copy.setReason(source.getReason());
        copy.setReadyMessages(source.getReadyMessages());
        copy.setUnackedMessages(source.getUnackedMessages());
        copy.setTotalMessages(source.getTotalMessages());
        copy.setConsumers(source.getConsumers());
        copy.setRejectedTaskCount(source.getRejectedTaskCount());
        copy.setCheckedAt(source.getCheckedAt());
        copy.setQueues(new ArrayList<>(source.getQueues()));
        return copy;
    }
}
