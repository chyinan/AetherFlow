package com.aetherflow.workflow.runtime.core;

import com.aetherflow.workflow.runtime.api.RuntimeState;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

public class RuntimeStateMachine {

    private final Map<RuntimeState, Set<RuntimeState>> transitions;

    public RuntimeStateMachine() {
        transitions = new EnumMap<>(RuntimeState.class);
        transitions.put(RuntimeState.PENDING, EnumSet.of(RuntimeState.RUNNING, RuntimeState.CANCELLED));
        transitions.put(RuntimeState.RUNNING, EnumSet.of(
                RuntimeState.RETRYING,
                RuntimeState.SUCCESS,
                RuntimeState.FAILED,
                RuntimeState.CANCELLED
        ));
        transitions.put(RuntimeState.RETRYING, EnumSet.of(RuntimeState.RUNNING, RuntimeState.FAILED, RuntimeState.CANCELLED));
        transitions.put(RuntimeState.SUCCESS, EnumSet.noneOf(RuntimeState.class));
        transitions.put(RuntimeState.FAILED, EnumSet.noneOf(RuntimeState.class));
        transitions.put(RuntimeState.CANCELLED, EnumSet.noneOf(RuntimeState.class));
    }

    public RuntimeState transition(RuntimeState current, RuntimeState target) {
        if (current == target) {
            return target;
        }
        if (isTerminal(current)) {
            throw new IllegalStateException("cannot transition terminal runtime state " + current + " to " + target);
        }
        Set<RuntimeState> allowedTargets = transitions.getOrDefault(current, Set.of());
        if (!allowedTargets.contains(target)) {
            throw new IllegalStateException("illegal runtime state transition from " + current + " to " + target);
        }
        return target;
    }

    public boolean isTerminal(RuntimeState state) {
        return state == RuntimeState.SUCCESS || state == RuntimeState.FAILED || state == RuntimeState.CANCELLED;
    }
}
