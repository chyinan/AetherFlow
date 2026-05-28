package com.aetherflow.workflow.runtime.logging;

import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;

class RuntimeLogContextTest {

    @Test
    void addsRuntimeIdentityToMdcAndClearsItAfterExecution() {
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "workflow-1",
                "trace-1",
                "task-1",
                Map.of()
        );
        AtomicBoolean inspected = new AtomicBoolean();

        RuntimeLogContext.run(context, "node-a", () -> {
            inspected.set(true);
            assertThat(MDC.get("traceId")).isEqualTo("trace-1");
            assertThat(MDC.get("workflowId")).isEqualTo("workflow-1");
            assertThat(MDC.get("nodeId")).isEqualTo("node-a");
            assertThat(MDC.get("taskId")).isEqualTo("task-1");
        });

        assertThat(inspected).isTrue();
        assertThat(MDC.get("traceId")).isNull();
        assertThat(MDC.get("workflowId")).isNull();
        assertThat(MDC.get("nodeId")).isNull();
        assertThat(MDC.get("taskId")).isNull();
    }
}
