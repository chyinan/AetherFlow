package com.aetherflow.workflow.runtime.stream;

// pattern: Imperative Shell
import com.aetherflow.workflow.runtime.api.RuntimeEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RuntimeEventWebSocketHandler extends TextWebSocketHandler {

    private static final int MAX_REMEMBERED_EVENT_IDS = 2_048;

    private final RuntimeEventStreamService streamService;
    private final ObjectMapper objectMapper;
    private final WorkflowRuntimeWebSocketProperties properties;
    private final ScheduledExecutorService executor;
    private final Map<String, ConnectionState> connections = new ConcurrentHashMap<>();

    public RuntimeEventWebSocketHandler(RuntimeEventStreamService streamService,
                                        ObjectMapper objectMapper,
                                        WorkflowRuntimeWebSocketProperties properties) {
        this(streamService, objectMapper, properties, newExecutor(properties.getThreadPoolSize()));
    }

    RuntimeEventWebSocketHandler(RuntimeEventStreamService streamService,
                                 ObjectMapper objectMapper,
                                 WorkflowRuntimeWebSocketProperties properties,
                                 ScheduledExecutorService executor) {
        this.streamService = streamService;
        this.objectMapper = objectMapper;
        this.properties = properties;
        this.executor = executor;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String workflowId = attribute(session, "workflowId");
        if (workflowId == null) {
            session.close(CloseStatus.POLICY_VIOLATION.withReason("missing workflow scope"));
            return;
        }
        if (connections.size() >= properties.getMaxConnections()) {
            session.close(CloseStatus.SERVICE_OVERLOAD.withReason("stream capacity reached"));
            return;
        }
        ConnectionState state = new ConnectionState(workflowId, attribute(session, "cursor"));
        connections.put(session.getId(), state);
        ScheduledFuture<?> future = executor.scheduleWithFixedDelay(
                () -> poll(session, state),
                0,
                properties.getPollInterval().toMillis(),
                TimeUnit.MILLISECONDS
        );
        state.future(future);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        cleanup(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        cleanup(session.getId());
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }

    @PreDestroy
    public void shutdown() {
        connections.values().forEach(ConnectionState::cancel);
        connections.clear();
        executor.shutdownNow();
    }

    private void poll(WebSocketSession session, ConnectionState state) {
        if (!session.isOpen()) {
            cleanup(session.getId());
            return;
        }
        try {
            if (state.expired(properties.getStreamTimeout().toMillis())) {
                close(session, CloseStatus.NORMAL.withReason("stream lease expired"));
                return;
            }
            boolean terminal = false;
            for (RuntimeEvent event : streamService.eventsAfterCursor(state.workflowId(), state.cursor())) {
                if (!state.markSent(event.eventId())) {
                    continue;
                }
                state.cursor(event.eventId());
                sendFrame(session, "runtime-event", event, state.cursor());
                terminal = terminal || streamService.isTerminal(event);
            }
            if (terminal) {
                close(session, CloseStatus.NORMAL.withReason("workflow terminal"));
                return;
            }
            Instant now = Instant.now();
            if (state.shouldHeartbeat(now, properties.getHeartbeatInterval().toMillis())) {
                sendFrame(session, "heartbeat",
                        streamService.heartbeatPayload(state.workflowId(), state.cursor(), now), state.cursor());
            }
        } catch (Exception exception) {
            close(session, CloseStatus.SERVER_ERROR.withReason("runtime stream failed"));
        }
    }

    private void sendFrame(WebSocketSession session, String event, Object data, String cursor) throws Exception {
        Map<String, Object> frame = new LinkedHashMap<>();
        frame.put("event", event);
        frame.put("cursor", cursor == null ? "" : cursor);
        frame.put("data", data);
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(frame)));
    }

    private void close(WebSocketSession session, CloseStatus status) {
        cleanup(session.getId());
        try {
            if (session.isOpen()) {
                session.close(status);
            }
        } catch (Exception ignored) {
            // The transport is already closing.
        }
    }

    private void cleanup(String sessionId) {
        ConnectionState state = connections.remove(sessionId);
        if (state != null) {
            state.cancel();
        }
    }

    private String attribute(WebSocketSession session, String name) {
        Object value = session.getAttributes().get(name);
        return value instanceof String text && !text.isBlank() ? text : null;
    }

    private static ScheduledExecutorService newExecutor(int threadPoolSize) {
        AtomicInteger counter = new AtomicInteger();
        return Executors.newScheduledThreadPool(threadPoolSize, runnable -> {
            Thread thread = new Thread(runnable, "workflow-runtime-ws-" + counter.incrementAndGet());
            thread.setDaemon(true);
            return thread;
        });
    }

    private static final class ConnectionState {
        private final String workflowId;
        private final Instant connectedAt = Instant.now();
        private final Set<String> sentEventIds = new LinkedHashSet<>();
        private String cursor;
        private Instant lastHeartbeatAt = Instant.EPOCH;
        private ScheduledFuture<?> future;
        private boolean cancelled;

        private ConnectionState(String workflowId, String cursor) {
            this.workflowId = workflowId;
            this.cursor = cursor;
        }

        private String workflowId() {
            return workflowId;
        }

        private synchronized String cursor() {
            return cursor;
        }

        private synchronized void cursor(String cursor) {
            this.cursor = cursor;
        }

        private synchronized boolean markSent(String eventId) {
            if (!sentEventIds.add(eventId)) {
                return false;
            }
            if (sentEventIds.size() > MAX_REMEMBERED_EVENT_IDS) {
                sentEventIds.remove(sentEventIds.iterator().next());
            }
            return true;
        }

        private synchronized boolean shouldHeartbeat(Instant now, long intervalMs) {
            if (now.toEpochMilli() - lastHeartbeatAt.toEpochMilli() < intervalMs) {
                return false;
            }
            lastHeartbeatAt = now;
            return true;
        }

        private boolean expired(long timeoutMs) {
            return Instant.now().toEpochMilli() - connectedAt.toEpochMilli() >= timeoutMs;
        }

        private synchronized void future(ScheduledFuture<?> future) {
            this.future = future;
            if (cancelled) {
                future.cancel(true);
            }
        }

        private synchronized void cancel() {
            cancelled = true;
            if (future != null) {
                future.cancel(true);
            }
        }
    }
}
