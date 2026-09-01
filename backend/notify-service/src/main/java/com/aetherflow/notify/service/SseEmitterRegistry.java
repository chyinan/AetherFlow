package com.aetherflow.notify.service;

// pattern: Imperative Shell

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.aetherflow.notify.dto.NotificationRecordResponse;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import jakarta.annotation.PreDestroy;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CompletableFuture;

@Component
public class SseEmitterRegistry {

    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();
    private final Map<SseEmitter, CompletableFuture<Void>> sendTails = new ConcurrentHashMap<>();
    private final int maxConnections = parsePositiveInt(System.getenv("NOTIFY_MAX_SSE_CONNECTIONS"), 10_000);
    private final int maxConnectionsPerUser = parsePositiveInt(System.getenv("NOTIFY_MAX_SSE_CONNECTIONS_PER_USER"), 20);
    private final AtomicInteger connectionCount = new AtomicInteger();
    private final ThreadPoolExecutor sendExecutor = new ThreadPoolExecutor(
            4, 32, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(2_000), runnable -> {
                Thread thread = new Thread(runnable, "notify-sse-send");
                thread.setDaemon(true);
                return thread;
            }, new ThreadPoolExecutor.AbortPolicy());
    private final ScheduledExecutorService heartbeatExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "notify-sse-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    public SseEmitterRegistry() {
        heartbeatExecutor.scheduleAtFixedRate(this::heartbeat, 20, 20, TimeUnit.SECONDS);
    }

    public SseEmitter register(Long userId) {
        return register(userId, List.of());
    }

    public SseEmitter register(Long userId, List<NotificationRecordResponse> replay) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ResultCode.UNAUTHORIZED, "authenticated user is required");
        }
        SseEmitter emitter = new SseEmitter(TimeUnit.MINUTES.toMillis(30));
        synchronized (emitters) {
            List<SseEmitter> userEmitters = emitters.get(userId);
            if (userEmitters != null && userEmitters.size() >= maxConnectionsPerUser) {
                throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE,
                        "notification stream capacity reached for user");
            }
            reserveGlobalConnection();
            sendTails.put(emitter, CompletableFuture.completedFuture(null));
            emitters.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        }
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(error -> remove(userId, emitter));
        if (replay != null) {
            replay.forEach(record -> dispatch(userId, emitter, SseEmitter.event()
                    .id(String.valueOf(record.id()))
                    .name("notification")
                    .data(record)));
        }
        return emitter;
    }

    private void reserveGlobalConnection() {
        int current = connectionCount.incrementAndGet();
        if (current > maxConnections) {
            connectionCount.decrementAndGet();
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "notification stream capacity reached");
        }
    }

    public void send(Long userId, Object payload) {
        if (userId == null || userId <= 0) {
            return;
        }
        emitters.getOrDefault(userId, List.of()).forEach(emitter -> dispatch(userId, emitter, payload));
    }

    private void heartbeat() {
        emitters.forEach((userId, list) -> list.forEach(emitter -> {
            dispatch(userId, emitter, SseEmitter.event().name("heartbeat").data(Map.of("ts", System.currentTimeMillis())));
        }));
    }

    @PreDestroy
    void shutdown() {
        heartbeatExecutor.shutdownNow();
        sendExecutor.shutdownNow();
    }

    private void sendOne(Long userId, SseEmitter emitter, Object payload) {
        try {
            if (payload instanceof NotifyMessageDTO message && message.getEventId() != null) {
                emitter.send(SseEmitter.event().id(message.getEventId()).name("notification").data(payload));
            } else {
                emitter.send(payload);
            }
        } catch (IOException | RuntimeException exception) {
            remove(userId, emitter);
            try {
                emitter.completeWithError(exception);
            } catch (RuntimeException ignored) {
                // Emitter is already closed.
            }
        }
    }

    private void remove(Long userId, SseEmitter emitter) {
        List<SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters != null) {
            if (userEmitters.remove(emitter)) {
                connectionCount.decrementAndGet();
                sendTails.remove(emitter);
                if (userEmitters.isEmpty()) {
                    emitters.remove(userId, userEmitters);
                }
            }
        }
    }

    private void dispatch(Long userId, SseEmitter emitter, Object payload) {
        try {
            sendTails.computeIfPresent(emitter, (ignored, previous) -> previous
                    .handle((value, error) -> null)
                    .thenRunAsync(() -> sendOne(userId, emitter, payload), sendExecutor)
                    .exceptionally(error -> {
                        remove(userId, emitter);
                        return null;
                    }));
        } catch (RejectedExecutionException rejected) {
            remove(userId, emitter);
            emitter.completeWithError(rejected);
        }
    }

    private static int parsePositiveInt(String value, int fallback) {
        try {
            return value == null ? fallback : Math.max(1, Integer.parseInt(value));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}

