package com.aetherflow.ai.outbox;

import com.aetherflow.ai.callback.AiTaskCallbackService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

// pattern: Imperative Shell
@Slf4j
@Service
@RequiredArgsConstructor
public class AiTaskEventOutboxPublisher {

    private static final int BATCH_SIZE = 100;
    private static final Duration PROCESSING_TIMEOUT = Duration.ofMinutes(2);
    private static final Duration MAX_BACKOFF = Duration.ofMinutes(5);

    private final AiTaskEventOutboxMapper mapper;
    private final AiTaskCallbackService callbackService;
    private final ObjectMapper objectMapper;

    public boolean publish(AiTaskEventOutbox event) {
        if (event == null || event.getId() == null || AiTaskEventOutbox.PUBLISHED.equals(event.getStatus())) {
            return false;
        }
        LocalDateTime now = LocalDateTime.now();
        int claimed = mapper.claimForPublishing(event.getId(), now, now.minus(PROCESSING_TIMEOUT));
        if (claimed != 1) {
            return false;
        }
        event.setStatus(AiTaskEventOutbox.PROCESSING);
        event.setUpdatedAt(now);
        try {
            publishPayload(event);
            event.setStatus(AiTaskEventOutbox.PUBLISHED);
            event.setPublishedAt(LocalDateTime.now());
            event.setLastError(null);
            event.setUpdatedAt(event.getPublishedAt());
            mapper.updateById(event);
            return true;
        } catch (RuntimeException exception) {
            markForRetry(event, exception);
            return false;
        }
    }

    public int publishPendingForJob(AiJob job) {
        if (job == null || job.getId() == null) {
            return 0;
        }
        List<AiTaskEventOutbox> events = mapper.selectList(new LambdaQueryWrapper<AiTaskEventOutbox>()
                .eq(AiTaskEventOutbox::getAiJobId, job.getId())
                .ne(AiTaskEventOutbox::getStatus, AiTaskEventOutbox.PUBLISHED)
                .orderByAsc(AiTaskEventOutbox::getId));
        return publishAll(events);
    }

    @Scheduled(fixedDelayString = "${aetherflow.ai.outbox-publish-interval-millis:5000}")
    public int publishDueEvents() {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime staleBefore = now.minus(PROCESSING_TIMEOUT);
        List<AiTaskEventOutbox> events = mapper.selectList(new LambdaQueryWrapper<AiTaskEventOutbox>()
                .and(wrapper -> wrapper
                        .eq(AiTaskEventOutbox::getStatus, AiTaskEventOutbox.PENDING)
                        .and(pending -> pending.isNull(AiTaskEventOutbox::getNextAttemptAt)
                                .or()
                                .le(AiTaskEventOutbox::getNextAttemptAt, now))
                        .or(processing -> processing
                                .eq(AiTaskEventOutbox::getStatus, AiTaskEventOutbox.PROCESSING)
                                .le(AiTaskEventOutbox::getUpdatedAt, staleBefore)))
                .orderByAsc(AiTaskEventOutbox::getId)
                .last("LIMIT " + BATCH_SIZE));
        return publishAll(events);
    }

    private int publishAll(List<AiTaskEventOutbox> events) {
        if (events == null || events.isEmpty()) {
            return 0;
        }
        int published = 0;
        for (AiTaskEventOutbox event : events) {
            if (publish(event)) {
                published++;
            }
        }
        return published;
    }

    private void publishPayload(AiTaskEventOutbox event) {
        AiTaskEventPayload payload = readPayload(event.getPayloadJson());
        if ("AI_TASK_SUCCEEDED".equals(event.getEventType())) {
            if (payload.taskMessage() == null || payload.result() == null) {
                throw new BusinessException(ResultCode.INTERNAL_ERROR, "ai task success outbox payload is incomplete");
            }
            callbackService.notifySuccess(payload.taskMessage(), payload.result());
            return;
        }
        if ("AI_TASK_FAILED".equals(event.getEventType())) {
            if (payload.taskMessage() == null) {
                throw new BusinessException(ResultCode.INTERNAL_ERROR, "ai task failure outbox payload is incomplete");
            }
            callbackService.notifyFailure(payload.taskMessage(), safeError(payload.error(), null));
            return;
        }
        throw new BusinessException(ResultCode.INTERNAL_ERROR,
                "unsupported ai task outbox event type: " + event.getEventType());
    }

    private AiTaskEventPayload readPayload(String payloadJson) {
        try {
            return objectMapper.readValue(payloadJson, AiTaskEventPayload.class);
        } catch (JsonProcessingException | IllegalArgumentException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "ai task outbox payload is invalid");
        }
    }

    private void markForRetry(AiTaskEventOutbox event, RuntimeException exception) {
        int attempts = event.getAttemptCount() == null ? 1 : event.getAttemptCount() + 1;
        LocalDateTime now = LocalDateTime.now();
        event.setStatus(AiTaskEventOutbox.PENDING);
        event.setAttemptCount(attempts);
        event.setNextAttemptAt(now.plus(backoff(attempts)));
        event.setLastError(safeError(null, exception));
        event.setUpdatedAt(now);
        mapper.updateById(event);
        log.warn("AI task outbox publish failed eventId={}, attemptCount={}, reason={}",
                event.getEventId(), attempts, event.getLastError());
    }

    private Duration backoff(int attempts) {
        long seconds = 1L << Math.min(Math.max(0, attempts - 1), 8);
        return Duration.ofSeconds(Math.min(seconds, MAX_BACKOFF.toSeconds()));
    }

    private String safeError(String message, RuntimeException exception) {
        if (message != null && !message.isBlank()) {
            return message.trim();
        }
        if (exception != null && exception.getMessage() != null && !exception.getMessage().isBlank()) {
            return exception.getMessage().trim();
        }
        return exception == null
                ? "AI task failed"
                : "AI task outbox publish failed: " + exception.getClass().getSimpleName();
    }
}
