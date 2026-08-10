package com.aetherflow.workflow.node.code;

// pattern: Imperative Shell
public interface CodeExecutionRuntime {

    CodeExecutionResult execute(String language, String code, Object input, int timeoutMs, int maxOutputBytes);

    record CodeExecutionResult(Object result, String stdout, long durationMs, boolean truncated) {
    }

    static CodeExecutionRuntime unavailable() {
        return (language, code, input, timeoutMs, maxOutputBytes) -> {
            throw new IllegalStateException("isolated code runtime is unavailable");
        };
    }
}
