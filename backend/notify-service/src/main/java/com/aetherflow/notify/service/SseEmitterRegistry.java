package com.aetherflow.notify.service;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Component
public class SseEmitterRegistry {

    private final Map<Long, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter register(Long userId) {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.computeIfAbsent(userId, ignored -> new CopyOnWriteArrayList<>()).add(emitter);
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(error -> remove(userId, emitter));
        return emitter;
    }

    public void send(Long userId, Object payload) {
        if (userId == null) {
            emitters.values().forEach(list -> list.forEach(emitter -> sendOne(emitter, payload)));
            return;
        }
        emitters.getOrDefault(userId, List.of()).forEach(emitter -> sendOne(emitter, payload));
    }

    private void sendOne(SseEmitter emitter, Object payload) {
        try {
            emitter.send(payload);
        } catch (IOException exception) {
            emitter.completeWithError(exception);
        }
    }

    private void remove(Long userId, SseEmitter emitter) {
        List<SseEmitter> userEmitters = emitters.get(userId);
        if (userEmitters != null) {
            userEmitters.remove(emitter);
        }
    }
}

