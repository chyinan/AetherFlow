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
// pattern: Functional Core
public class DefaultAiNodeExecutorRegistry {

    /**
     * 节点类型别名：工作流目录与异步任务使用 WHISPER，ASR 执行器只登记 ASR。
     * 同步入口与异步 worker 共用本注册表，别名在这里解析可同时覆盖两条链路。
     */
    private static final Map<String, String> NODE_TYPE_ALIASES = Map.of("WHISPER", "ASR");

    private final Map<String, AiNodeExecutor> executors;

    public DefaultAiNodeExecutorRegistry(List<AiNodeExecutor> executors) {
        this.executors = executors.stream()
                .collect(Collectors.toUnmodifiableMap(executor -> normalize(executor.nodeType()), Function.identity()));
    }

    public AiNodeExecutor getRequired(String nodeType) {
        String normalized = normalize(nodeType);
        AiNodeExecutor executor = executors.get(normalized);
        if (executor == null) {
            executor = executors.get(NODE_TYPE_ALIASES.getOrDefault(normalized, normalized));
        }
        if (executor == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "unsupported ai node type: " + nodeType);
        }
        return executor;
    }

    public List<String> availableNodeTypes() {
        return executors.keySet().stream().sorted().toList();
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }
}
