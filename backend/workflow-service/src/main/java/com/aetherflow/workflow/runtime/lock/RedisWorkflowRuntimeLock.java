package com.aetherflow.workflow.runtime.lock;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

public class RedisWorkflowRuntimeLock implements WorkflowRuntimeLock {

    private static final String DEFAULT_KEY_PREFIX = "aetherflow:workflow:runtime:lock:";
    private static final Duration DEFAULT_TTL = Duration.ofSeconds(60);
    private static final RedisScript<Long> RENEW_SCRIPT = RedisScript.of("""
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('pexpire', KEYS[1], ARGV[2])
            end
            return 0
            """, Long.class);
    private static final RedisScript<Long> RELEASE_SCRIPT = RedisScript.of("""
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            end
            return 0
            """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final WorkflowRuntimeProperties.Lock properties;

    public RedisWorkflowRuntimeLock(StringRedisTemplate redisTemplate, WorkflowRuntimeProperties.Lock properties) {
        this.redisTemplate = Objects.requireNonNull(redisTemplate, "redisTemplate must not be null");
        this.properties = properties == null ? new WorkflowRuntimeProperties.Lock() : properties;
    }

    @Override
    public Optional<WorkflowRuntimeLockLease> acquire(String workflowId) {
        String requiredWorkflowId = requireWorkflowId(workflowId);
        Duration ttl = ttl();
        String token = UUID.randomUUID().toString();
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key(requiredWorkflowId), token, ttl);
        if (!Boolean.TRUE.equals(acquired)) {
            return Optional.empty();
        }
        return Optional.of(new WorkflowRuntimeLockLease(requiredWorkflowId, token, ttl));
    }

    @Override
    public boolean renew(WorkflowRuntimeLockLease lease) {
        WorkflowRuntimeLockLease requiredLease = Objects.requireNonNull(lease, "lease must not be null");
        Duration ttl = ttl(requiredLease.ttl());
        Long result = redisTemplate.execute(RENEW_SCRIPT,
                List.of(key(requiredLease.workflowId())),
                requiredLease.token(),
                String.valueOf(ttl.toMillis()));
        return result != null && result > 0;
    }

    @Override
    public boolean release(WorkflowRuntimeLockLease lease) {
        WorkflowRuntimeLockLease requiredLease = Objects.requireNonNull(lease, "lease must not be null");
        Long result = redisTemplate.execute(RELEASE_SCRIPT,
                List.of(key(requiredLease.workflowId())),
                requiredLease.token());
        return result != null && result > 0;
    }

    private String key(String workflowId) {
        String prefix = properties.getKeyPrefix();
        if (prefix == null || prefix.isBlank()) {
            prefix = DEFAULT_KEY_PREFIX;
        }
        return prefix + workflowId;
    }

    private Duration ttl() {
        return ttl(properties.getTtl());
    }

    private Duration ttl(Duration candidate) {
        if (candidate == null || candidate.isZero() || candidate.isNegative()) {
            return DEFAULT_TTL;
        }
        return candidate;
    }

    private String requireWorkflowId(String workflowId) {
        if (workflowId == null || workflowId.isBlank()) {
            throw new IllegalArgumentException("workflowId must not be blank");
        }
        return workflowId;
    }
}
