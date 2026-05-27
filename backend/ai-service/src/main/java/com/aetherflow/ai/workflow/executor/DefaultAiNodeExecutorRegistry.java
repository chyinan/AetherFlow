package com.aetherflow.ai.workflow.executor;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class DefaultAiNodeExecutorRegistry {

    private final Map<String, AiNodeExecutor> executors;

    public DefaultAiNodeExecutorRegistry(List<AiNodeExecutor> executors) {
        this.executors = executors.stream()
                .collect(Collectors.toUnmodifiableMap(executor -> normalize(executor.nodeType()), Function.identity()));
    }

    public AiNodeExecutor getRequired(String nodeType) {
        AiNodeExecutor executor = executors.get(normalize(nodeType));
        if (executor == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported ai node type: " + nodeType);
        }
        return executor;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
