package com.aetherflow.workflow.runtime.lock;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RedisWorkflowRuntimeLockTest {

    private static final String WORKFLOW_ID = "workflow-1";
    private static final String KEY = "aetherflow:workflow:runtime:lock:" + WORKFLOW_ID;
    private static final Duration TTL = Duration.ofSeconds(30);

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ValueOperations<String, String> valueOperations;

    private RedisWorkflowRuntimeLock lock;

    @BeforeEach
    void setUp() {
        WorkflowRuntimeProperties.Lock properties = new WorkflowRuntimeProperties.Lock();
        properties.setTtl(TTL);
        lock = new RedisWorkflowRuntimeLock(redisTemplate, properties);
    }

    @Test
    void acquiresMutuallyExclusiveWorkflowLockWithTtl() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), eq(TTL))).thenReturn(true, false);

        Optional<WorkflowRuntimeLockLease> first = lock.acquire(WORKFLOW_ID);
        Optional<WorkflowRuntimeLockLease> second = lock.acquire(WORKFLOW_ID);

        assertThat(first).isPresent();
        assertThat(first.orElseThrow().workflowId()).isEqualTo(WORKFLOW_ID);
        assertThat(first.orElseThrow().ttl()).isEqualTo(TTL);
        assertThat(second).isEmpty();
        verify(valueOperations, times(2)).setIfAbsent(eq(KEY), anyString(), eq(TTL));
    }

    @Test
    void renewsOnlyOwnerToken() {
        WorkflowRuntimeLockLease lease = new WorkflowRuntimeLockLease(WORKFLOW_ID, "token-1", TTL);
        when(redisTemplate.execute(ArgumentMatchers.<RedisScript<Long>>any(),
                eq(List.of(KEY)), eq("token-1"), eq("30000"))).thenReturn(1L);

        boolean renewed = lock.renew(lease);

        assertThat(renewed).isTrue();
    }

    @Test
    void rejectsRenewWhenTokenIsNotCurrentOwner() {
        WorkflowRuntimeLockLease lease = new WorkflowRuntimeLockLease(WORKFLOW_ID, "stale-token", TTL);
        when(redisTemplate.execute(ArgumentMatchers.<RedisScript<Long>>any(),
                eq(List.of(KEY)), eq("stale-token"), eq("30000"))).thenReturn(0L);

        boolean renewed = lock.renew(lease);

        assertThat(renewed).isFalse();
    }

    @Test
    void releasesOnlyOwnerToken() {
        WorkflowRuntimeLockLease lease = new WorkflowRuntimeLockLease(WORKFLOW_ID, "token-1", TTL);
        when(redisTemplate.execute(ArgumentMatchers.<RedisScript<Long>>any(),
                eq(List.of(KEY)), eq("token-1"))).thenReturn(1L);

        boolean released = lock.release(lease);

        assertThat(released).isTrue();
    }

    @Test
    void allowsLaterAcquireAfterRedisTtlExpires() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.setIfAbsent(eq(KEY), anyString(), eq(TTL))).thenReturn(false, true);

        Optional<WorkflowRuntimeLockLease> whileHeld = lock.acquire(WORKFLOW_ID);
        Optional<WorkflowRuntimeLockLease> afterRedisTtl = lock.acquire(WORKFLOW_ID);

        assertThat(whileHeld).isEmpty();
        assertThat(afterRedisTtl).isPresent();
    }
}
