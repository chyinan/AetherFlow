package com.aetherflow.ai.task;

// pattern: Imperative Shell

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Component
@RequiredArgsConstructor
public class AiJobLeaseHeartbeat {

    private static final ScheduledExecutorService SHARED_SCHEDULER = Executors.newScheduledThreadPool(8, runnable -> {
        Thread thread = new Thread(runnable, "ai-job-lease-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    private final AiJobLeaseService leaseService;

    public LeaseGuard start(AiJobLease lease, Duration leaseDuration, Duration heartbeatInterval) {
        validate(lease, leaseDuration, heartbeatInterval);
        AtomicBoolean owned = new AtomicBoolean(true);
        LeaseGuard guard = new LeaseGuard(lease, owned);
        long intervalMillis = Math.max(1L, heartbeatInterval.toMillis());
        guard.future = SHARED_SCHEDULER.scheduleAtFixedRate(
                () -> renew(guard, leaseDuration),
                intervalMillis,
                intervalMillis,
                TimeUnit.MILLISECONDS);
        return guard;
    }

    private void renew(LeaseGuard guard, Duration leaseDuration) {
        if (!guard.isOwned()) {
            return;
        }
        try {
            var renewed = leaseService.renewLease(guard.lease(), LocalDateTime.now(), leaseDuration);
            if (renewed.isEmpty()) {
                guard.loseOwnership();
                log.warn("AI job lease heartbeat rejected, jobId={}", guard.lease().jobId());
            } else {
                guard.updateLease(renewed.get());
            }
        } catch (RuntimeException exception) {
            guard.loseOwnership();
            log.error("AI job lease heartbeat failed, jobId={}", guard.lease().jobId(), exception);
        }
    }

    private void validate(AiJobLease lease, Duration leaseDuration, Duration heartbeatInterval) {
        if (lease == null || lease.jobId() == null || lease.token() == null || lease.token().isBlank()) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job lease is required for heartbeat");
        }
        if (leaseDuration == null || leaseDuration.isZero() || leaseDuration.isNegative()
                || heartbeatInterval == null || heartbeatInterval.isZero() || heartbeatInterval.isNegative()
                || heartbeatInterval.compareTo(leaseDuration) >= 0) {
            throw new BusinessException(ResultCode.BAD_REQUEST,
                    "ai job heartbeat interval must be positive and shorter than lease duration");
        }
    }

    public static final class LeaseGuard implements AutoCloseable {

        private final AtomicReference<AiJobLease> lease;
        private final AtomicBoolean owned;
        private volatile ScheduledFuture<?> future;

        private LeaseGuard(AiJobLease lease,
                           AtomicBoolean owned) {
            this.lease = new AtomicReference<>(lease);
            this.owned = owned;
        }

        public AiJobLease lease() {
            return lease.get();
        }

        private void updateLease(AiJobLease renewed) {
            lease.set(renewed);
        }

        public boolean isOwned() {
            return owned.get();
        }

        public void assertOwned() {
            if (!isOwned()) {
                throw new BusinessException(ResultCode.CONFLICT,
                        "ai job lease ownership lost during execution");
            }
        }

        private void loseOwnership() {
            owned.set(false);
            ScheduledFuture<?> current = future;
            if (current != null) {
                current.cancel(false);
            }
        }

        @Override
        public void close() {
            ScheduledFuture<?> current = future;
            if (current != null) {
                current.cancel(false);
            }
        }
    }
}
