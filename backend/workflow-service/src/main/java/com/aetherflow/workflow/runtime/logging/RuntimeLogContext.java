package com.aetherflow.workflow.runtime.logging;

import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.slf4j.MDC;

import java.util.Map;
import java.util.function.Supplier;

public final class RuntimeLogContext {

    private RuntimeLogContext() {
    }

    public static void run(WorkflowContext context, String nodeId, Runnable runnable) {
        supply(context, nodeId, () -> {
            runnable.run();
            return null;
        });
    }

    public static <T> T supply(WorkflowContext context, String nodeId, Supplier<T> supplier) {
        Map<String, String> previousContext = MDC.getCopyOfContextMap();
        put("traceId", context.traceId());
        put("workflowId", context.workflowId());
        put("nodeId", nodeId);
        put("taskId", context.taskId());
        try {
            return supplier.get();
        } finally {
            if (previousContext == null) {
                MDC.clear();
            } else {
                MDC.setContextMap(previousContext);
            }
        }
    }

    private static void put(String key, String value) {
        if (value == null || value.isBlank()) {
            MDC.remove(key);
        } else {
            MDC.put(key, value);
        }
    }
}
