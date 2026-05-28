package com.aetherflow.workflow.runtime.engine;

import java.time.Duration;

@FunctionalInterface
public interface RuntimeSleeper {

    void sleep(Duration duration) throws InterruptedException;

    static RuntimeSleeper threadSleep() {
        return duration -> {
            if (duration != null && !duration.isZero() && !duration.isNegative()) {
                Thread.sleep(duration.toMillis());
            }
        };
    }

    static RuntimeSleeper noop() {
        return duration -> {
        };
    }
}
