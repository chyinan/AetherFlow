package com.aetherflow.workflow.runtime.core;

import com.aetherflow.workflow.runtime.api.RuntimeState;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RuntimeStateMachineTest {

    private final RuntimeStateMachine stateMachine = new RuntimeStateMachine();

    @Test
    void allowsRuntimeOwnedLifecycleTransitions() {
        assertThat(stateMachine.transition(RuntimeState.PENDING, RuntimeState.RUNNING))
                .isEqualTo(RuntimeState.RUNNING);
        assertThat(stateMachine.transition(RuntimeState.RUNNING, RuntimeState.RETRYING))
                .isEqualTo(RuntimeState.RETRYING);
        assertThat(stateMachine.transition(RuntimeState.RETRYING, RuntimeState.RUNNING))
                .isEqualTo(RuntimeState.RUNNING);
        assertThat(stateMachine.transition(RuntimeState.RUNNING, RuntimeState.SUCCESS))
                .isEqualTo(RuntimeState.SUCCESS);
    }

    @Test
    void rejectsInvalidTransitions() {
        assertThatThrownBy(() -> stateMachine.transition(RuntimeState.PENDING, RuntimeState.SUCCESS))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("PENDING")
                .hasMessageContaining("SUCCESS");
        assertThatThrownBy(() -> stateMachine.transition(RuntimeState.SUCCESS, RuntimeState.RUNNING))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("terminal");
    }

    @Test
    void treatsSuccessFailedAndCancelledAsTerminal() {
        assertThat(stateMachine.isTerminal(RuntimeState.SUCCESS)).isTrue();
        assertThat(stateMachine.isTerminal(RuntimeState.FAILED)).isTrue();
        assertThat(stateMachine.isTerminal(RuntimeState.CANCELLED)).isTrue();
        assertThat(stateMachine.isTerminal(RuntimeState.RUNNING)).isFalse();
    }
}
