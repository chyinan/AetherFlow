package com.aetherflow.workflow.node.executor;

import com.aetherflow.workflow.node.WorkflowNodeTypes;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.WorkflowContext;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class LoopNodeExecutor extends BaseNodeExecutor {

    public LoopNodeExecutor(WorkflowNodeMetrics metrics) {
        super(WorkflowNodeTypes.LOOP, metrics);
    }

    @Override
    protected NodeResult doExecute(WorkflowContext context, Map<String, Object> config) {
        Object state = NodeValueSupport.valueFromConfigOrVariable(config, context, "input", "inputVariable", "state");
        int maxIterations = Math.max(0, NodeValueSupport.intValue(config.get("maxIterations"), 1));
        String stopWhen = NodeValueSupport.stringValue(config.get("stopWhen"), "");
        boolean stopped = matchesStopCondition(state, stopWhen);
        int iterations = stopped ? 0 : maxIterations;
        String outputVariable = NodeValueSupport.stringValue(config.get("outputVariable"), "loopState");
        Map<String, Object> output = Map.of(
                "state", state == null ? "" : state,
                "iterations", iterations,
                "stopped", stopped
        );
        return buildResult(output, Map.of(outputVariable, state == null ? "" : state));
    }

    private boolean matchesStopCondition(Object state, String stopWhen) {
        if (stopWhen.isBlank() || state == null) {
            return false;
        }
        if (state instanceof Map<?, ?> stateMap && stateMap.containsKey(stopWhen)) {
            Object marker = stateMap.get(stopWhen);
            if (marker instanceof Boolean booleanMarker) {
                return booleanMarker;
            }
            if (marker instanceof Number numberMarker) {
                return numberMarker.doubleValue() != 0;
            }
            return marker != null && !String.valueOf(marker).isBlank();
        }
        return String.valueOf(state).contains(stopWhen);
    }
}
