package com.aetherflow.workflow.runtime.stream;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.aetherflow.workflow.runtime.api.RuntimeEventType;
import com.aetherflow.workflow.runtime.event.RuntimeEventStore;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@Service
public class RuntimeEventStreamService {

    private static final long STREAM_TIMEOUT_MS = TimeUnit.MINUTES.toMillis(5);
    private static final long POLL_INTERVAL_MS = 1000L;
    private static final long HEARTBEAT_INTERVAL_MS = 15000L;

    private final RuntimeEventStore runtimeEventStore;
    private final ScheduledExecutorService executor;
    private final long streamTimeoutMs;
    private final long pollIntervalMs;
    private final long heartbeatIntervalMs;

    @Autowired
    public RuntimeEventStreamService(RuntimeEventStore runtimeEventStore) {
        this(runtimeEventStore, newExecutor(), STREAM_TIMEOUT_MS, POLL_INTERVAL_MS, HEARTBEAT_INTERVAL_MS);
    }

    RuntimeEventStreamService(RuntimeEventStore runtimeEventStore,
                              ScheduledExecutorService executor,
                              long streamTimeoutMs,
                              long pollIntervalMs,
                              long heartbeatIntervalMs) {
        this.runtimeEventStore = runtimeEventStore;
        this.executor = executor;
        this.streamTimeoutMs = streamTimeoutMs;
        this.pollIntervalMs = pollIntervalMs;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
    }

    public SseEmitter stream(String workflowId, String lastEventId, String cursor) {
        if (!hasText(workflowId)) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "workflow id is required");
        }
        SseEmitter emitter = new SseEmitter(streamTimeoutMs);
        StreamState state = new StreamState(effectiveCursor(lastEventId, cursor));
        AtomicReference<ScheduledFuture<?>> futureRef = new AtomicReference<>();

        Runnable task = () -> pollAndEmit(emitter, workflowId, state, futureRef);
        ScheduledFuture<?> future = executor.scheduleWithFixedDelay(task, 0, pollIntervalMs, TimeUnit.MILLISECONDS);
        futureRef.set(future);

        Runnable cleanup = () -> cancel(futureRef.get());
        emitter.onCompletion(cleanup);
        emitter.onTimeout(() -> {
            cleanup.run();
            emitter.complete();
        });
        emitter.onError(error -> cleanup.run());
        return emitter;
    }

    List<RuntimeEvent> eventsAfterCursor(String workflowId, String cursor) {
        List<RuntimeEvent> events = safeEvents(workflowId);
        if (!hasText(cursor)) {
            return events;
        }
        for (int index = 0; index < events.size(); index++) {
            if (cursor.equals(events.get(index).eventId())) {
                return List.copyOf(events.subList(index + 1, events.size()));
            }
        }
        return events;
    }

    String effectiveCursor(String lastEventId, String cursor) {
        return hasText(cursor) ? cursor.trim() : trimToNull(lastEventId);
    }

    Map<String, Object> heartbeatPayload(String workflowId, String cursor, Instant now) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("workflowId", workflowId);
        payload.put("cursor", cursor == null ? "" : cursor);
        payload.put("occurredAt", now.toString());
        return payload;
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private void pollAndEmit(SseEmitter emitter,
                             String workflowId,
                             StreamState state,
                             AtomicReference<ScheduledFuture<?>> futureRef) {
        try {
            boolean sentTerminalEvent = false;
            for (RuntimeEvent event : eventsAfterCursor(workflowId, state.cursor())) {
                if (!state.markSent(event.eventId())) {
                    continue;
                }
                sendRuntimeEvent(emitter, event);
                state.cursor(event.eventId());
                sentTerminalEvent = sentTerminalEvent || isTerminal(event);
            }
            if (sentTerminalEvent) {
                cancel(futureRef.get());
                emitter.complete();
                return;
            }
            if (state.shouldHeartbeat(Instant.now(), heartbeatIntervalMs)) {
                sendHeartbeat(emitter, workflowId, state.cursor(), state.now());
            }
        } catch (RuntimeException exception) {
            cancel(futureRef.get());
            emitter.completeWithError(exception);
        }
    }

    private void sendRuntimeEvent(SseEmitter emitter, RuntimeEvent event) {
        try {
            emitter.send(SseEmitter.event()
                    .id(event.eventId())
                    .name("runtime-event")
                    .data(event));
        } catch (IOException | IllegalStateException exception) {
            throw new IllegalStateException("runtime event stream send failed", exception);
        }
    }

    private void sendHeartbeat(SseEmitter emitter, String workflowId, String cursor, Instant now) {
        try {
            emitter.send(SseEmitter.event()
                    .name("heartbeat")
                    .data(heartbeatPayload(workflowId, cursor, now)));
        } catch (IOException | IllegalStateException exception) {
            throw new IllegalStateException("runtime event heartbeat send failed", exception);
        }
    }

    private List<RuntimeEvent> safeEvents(String workflowId) {
        if (!hasText(workflowId)) {
            return List.of();
        }
        List<RuntimeEvent> events = runtimeEventStore.findByWorkflowId(workflowId);
        return events == null ? List.of() : List.copyOf(events);
    }

    private boolean isTerminal(RuntimeEvent event) {
        return event.eventType() == RuntimeEventType.WORKFLOW_COMPLETED
                || event.eventType() == RuntimeEventType.WORKFLOW_FAILED
                || event.eventType() == RuntimeEventType.WORKFLOW_CANCELLED;
    }

    private String trimToNull(String value) {
        return hasText(value) ? value.trim() : null;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private void cancel(ScheduledFuture<?> future) {
        if (future != null) {
            future.cancel(true);
        }
    }

    private static ScheduledExecutorService newExecutor() {
        AtomicInteger counter = new AtomicInteger();
        ThreadFactory threadFactory = runnable -> {
            Thread thread = new Thread(runnable, "workflow-runtime-sse-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        };
        return Executors.newScheduledThreadPool(2, threadFactory);
    }

    private static final class StreamState {

        private final Set<String> sentEventIds = new LinkedHashSet<>();
        private String cursor;
        private Instant lastHeartbeatAt = Instant.EPOCH;

        private StreamState(String cursor) {
            this.cursor = cursor;
        }

        private String cursor() {
            return cursor;
        }

        private void cursor(String cursor) {
            this.cursor = cursor;
        }

        private boolean markSent(String eventId) {
            return sentEventIds.add(eventId);
        }

        private boolean shouldHeartbeat(Instant now, long heartbeatIntervalMs) {
            return now.toEpochMilli() - lastHeartbeatAt.toEpochMilli() >= heartbeatIntervalMs;
        }

        private Instant now() {
            Instant now = Instant.now();
            lastHeartbeatAt = now;
            return now;
        }
    }
}
