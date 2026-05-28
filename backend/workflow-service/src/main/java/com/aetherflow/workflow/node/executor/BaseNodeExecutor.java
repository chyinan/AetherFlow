package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeExecutor;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.NodeType;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import com.aetherflow.workflow.runtime.logging.RuntimeLogContext;
import lombok.extern.slf4j.Slf4j;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

@Slf4j
public abstract class BaseNodeExecutor implements NodeExecutor {

    private final NodeType nodeType;
    private final WorkflowNodeMetrics metrics;

    protected BaseNodeExecutor(NodeType nodeType, WorkflowNodeMetrics metrics) {
        this.nodeType = Objects.requireNonNull(nodeType, "nodeType must not be null");
        this.metrics = Objects.requireNonNull(metrics, "metrics must not be null");
    }

    @Override
    public NodeType nodeType() {
        return nodeType;
    }

    @Override
    public final NodeResult execute(WorkflowContext context) throws Exception {
        Objects.requireNonNull(context, "context must not be null");
        metrics.recordExecution(context.runtimeState() == RuntimeState.RETRYING);
        try {
            return RuntimeLogContext.supply(context, context.currentNodeId(), () -> executeWithLogContext(context));
        } catch (NodeExecutionFailure failure) {
            metrics.recordFailure();
            throw failure.failure();
        } catch (RuntimeException exception) {
            metrics.recordFailure();
            throw exception;
        }
    }

    private NodeResult executeWithLogContext(WorkflowContext context) {
        Map<String, Object> config = nodeConfig(context);
        try {
            validate(context, config);
            log.info("workflow node executor running, nodeType={}", nodeType.value());
            NodeResult result = doExecute(context, config);
            return result == null ? buildResult(Map.of(), Map.of()) : result;
        } catch (Exception exception) {
            throw new NodeExecutionFailure(exception);
        }
    }

    protected void validate(WorkflowContext context, Map<String, Object> config) {
    }

    protected abstract NodeResult doExecute(WorkflowContext context, Map<String, Object> config) throws Exception;

    protected NodeResult buildResult(Map<String, Object> output, Map<String, Object> variables) {
        return NodeResult.success(output == null ? Map.of() : output, variables == null ? Map.of() : variables);
    }

    @SuppressWarnings("unchecked")
    protected Map<String, Object> nodeConfig(WorkflowContext context) {
        Object allConfigs = context.variables().get(WorkflowNodeContextKeys.NODE_CONFIGS);
        if (!(allConfigs instanceof Map<?, ?> configMap)) {
            return Map.of();
        }
        Object currentConfig = configMap.get(context.currentNodeId());
        if (!(currentConfig instanceof Map<?, ?> currentConfigMap)) {
            return Map.of();
        }
        Map<String, Object> safeConfig = new LinkedHashMap<>();
        currentConfigMap.forEach((key, value) -> safeConfig.put(String.valueOf(key), value));
        return Map.copyOf(safeConfig);
    }

    @SuppressWarnings("unchecked")
    protected Map<String, Object> asMap(Object value) {
        if (!(value instanceof Map<?, ?> source)) {
            return Map.of();
        }
        Map<String, Object> target = new LinkedHashMap<>();
        source.forEach((key, item) -> target.put(String.valueOf(key), item));
        return target;
    }

    private static final class NodeExecutionFailure extends RuntimeException {

        private final Exception failure;

        private NodeExecutionFailure(Exception failure) {
            super(failure);
            this.failure = failure;
        }

        private Exception failure() {
            return failure;
        }
    }
}
