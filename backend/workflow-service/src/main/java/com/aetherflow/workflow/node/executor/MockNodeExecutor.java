package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class MockNodeExecutor extends BaseNodeExecutor {

    public MockNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.MOCK, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) throws InterruptedException {
        if (Boolean.TRUE.equals(config.get("fail"))) {
            throw new IllegalStateException(String.valueOf(config.getOrDefault("message", "mock node failed")));
        }
        long delayMillis = longValue(config.get("delayMillis"));
        if (delayMillis > 0) {
            Thread.sleep(delayMillis);
        }
        return buildResult(asMap(config.get("output")), asMap(config.get("variables")));
    }

    private long longValue(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            return 0L;
        }
    }
}
