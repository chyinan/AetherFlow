package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
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
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
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
    private static final int MAX_EVENTS_PER_POLL = 500;
    private static final int MAX_CACHED_WORKFLOWS = 10_000;

    private final RuntimeEventStore runtimeEventStore;
    private final ScheduledExecutorService executor;
    private final long streamTimeoutMs;
    private final long pollIntervalMs;
    private final long heartbeatIntervalMs;
    private final ConcurrentMap<String, CachedEvents> workflowEventCache = new ConcurrentHashMap<>();

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

    public List<RuntimeEvent> eventsAfterCursor(String workflowId, String cursor) {
        if (!hasText(cursor)) {
            return boundedEvents(runtimeEventStore.supportsIncrementalQuery()
                    ? cachedEvents(workflowId)
                    : safeEvents(workflowId));
        }
        if (!runtimeEventStore.supportsIncrementalQuery()) {
            List<RuntimeEvent> events = safeEvents(workflowId);
            for (int index = 0; index < events.size(); index++) {
                if (cursor.equals(events.get(index).eventId())) {
                    return boundedEvents(events.subList(index + 1, events.size()));
                }
            }
            return boundedEvents(events);
        }
        List<RuntimeEvent> cached = cachedEvents(workflowId);
        for (int index = 0; index < cached.size(); index++) {
            if (cursor.trim().equals(cached.get(index).eventId())) {
                return boundedEvents(cached.subList(index + 1, cached.size()));
            }
        }
        List<RuntimeEvent> events = runtimeEventStore.findByWorkflowIdAfter(workflowId, cursor.trim(), MAX_EVENTS_PER_POLL);
        if (events == null) {
            // Preserve compatibility with older/custom stores that do not
            // implement the bounded overload; the result is still bounded
            // before it reaches the client.
            events = runtimeEventStore.findByWorkflowIdAfter(workflowId, cursor.trim());
        }
        if (events == null) {
            return boundedEvents(safeEvents(workflowId));
        }
        return boundedEvents(events);
    }

    public String effectiveCursor(String lastEventId, String cursor) {
        return hasText(cursor) ? cursor.trim() : trimToNull(lastEventId);
    }

    public Map<String, Object> heartbeatPayload(String workflowId, String cursor, Instant now) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("workflowId", workflowId);
        payload.put("cursor", cursor == null ? "" : cursor);
        payload.put("occurredAt", now.toString());
        return payload;
    }

    @PreDestroy
    public void shutdown() {
        workflowEventCache.clear();
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
        List<RuntimeEvent> events = runtimeEventStore.findByWorkflowId(workflowId, MAX_EVENTS_PER_POLL);
        if (events == null) {
            events = runtimeEventStore.findByWorkflowId(workflowId);
        }
        return events == null ? List.of() : List.copyOf(events);
    }

    private List<RuntimeEvent> cachedEvents(String workflowId) {
        if (!hasText(workflowId)) {
            return List.of();
        }
        long now = System.currentTimeMillis();
        CachedEvents cached = workflowEventCache.get(workflowId);
        if (cached != null && now - cached.loadedAtMs() < pollIntervalMs) {
            return cached.events();
        }
        CachedEvents refreshed = workflowEventCache.compute(workflowId, (key, current) -> {
            long currentTime = System.currentTimeMillis();
            if (current != null && currentTime - current.loadedAtMs() < pollIntervalMs) {
                return current;
            }
            List<RuntimeEvent> events = runtimeEventStore.findByWorkflowId(workflowId, MAX_EVENTS_PER_POLL);
            if (events == null) {
                events = runtimeEventStore.findByWorkflowId(workflowId);
            }
            return new CachedEvents(events == null ? List.of() : List.copyOf(events), currentTime);
        });
        if (workflowEventCache.size() > MAX_CACHED_WORKFLOWS) {
            workflowEventCache.keySet().stream().findFirst().ifPresent(workflowEventCache::remove);
        }
        return refreshed.events();
    }

    private List<RuntimeEvent> boundedEvents(List<RuntimeEvent> events) {
        if (events == null || events.isEmpty()) {
            return List.of();
        }
        return List.copyOf(events.subList(0, Math.min(events.size(), MAX_EVENTS_PER_POLL)));
    }

    public boolean isTerminal(RuntimeEvent event) {
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
        int poolSize = Math.max(4, Runtime.getRuntime().availableProcessors());
        return Executors.newScheduledThreadPool(poolSize, threadFactory);
    }

    private record CachedEvents(List<RuntimeEvent> events, long loadedAtMs) {
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
