package com.aetherflow.notify.service;

// pattern: Imperative Shell

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

class SseEmitterRegistryTest {

    @Test
    void concurrentRegistrationCannotBreakPerUserLimit() throws Exception {
        SseEmitterRegistry registry = new SseEmitterRegistry();
        ReflectionTestUtils.setField(registry, "maxConnectionsPerUser", 1);
        ExecutorService executor = Executors.newFixedThreadPool(16);
        CountDownLatch gate = new CountDownLatch(1);
        try {
            List<Callable<SseEmitter>> tasks = new ArrayList<>();
            for (int index = 0; index < 16; index++) {
                tasks.add(() -> {
                    gate.await(2, TimeUnit.SECONDS);
                    return registry.register(7L);
                });
            }
            List<Future<SseEmitter>> futures = executor.submit(() -> {
                gate.countDown();
                return executor.invokeAll(tasks);
            }).get(5, TimeUnit.SECONDS);

            int successfulRegistrations = 0;
            for (Future<SseEmitter> future : futures) {
                try {
                    future.get();
                    successfulRegistrations++;
                } catch (ExecutionException ignored) {
                    // The expected result for all but one caller is capacity rejection.
                }
            }
            assertThat(successfulRegistrations).isEqualTo(1);
        } finally {
            executor.shutdownNow();
            registry.shutdown();
        }
    }
}
