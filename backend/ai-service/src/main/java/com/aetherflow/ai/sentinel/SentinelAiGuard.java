package com.aetherflow.ai.sentinel;

import com.alibaba.csp.sentinel.Entry;
import com.alibaba.csp.sentinel.SphU;
import com.alibaba.csp.sentinel.Tracer;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.function.Supplier;

@Slf4j
@Component
public class SentinelAiGuard {

    public <T> T execute(String resourceName, Supplier<T> supplier) {
        Entry entry = null;
        try {
            entry = SphU.entry(resourceName);
            return supplier.get();
        } catch (BlockException exception) {
            log.warn("Sentinel blocked AI resource={}", resourceName);
            throw new BusinessException(ResultCode.TOO_MANY_REQUESTS, "ai inference is rate limited");
        } catch (RuntimeException exception) {
            Tracer.trace(exception);
            throw exception;
        } finally {
            if (entry != null) {
                entry.exit();
            }
        }
    }

    public void run(String resourceName, Runnable runnable) {
        execute(resourceName, () -> {
            runnable.run();
            return null;
        });
    }
}
