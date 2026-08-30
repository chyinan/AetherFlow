package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.async.WorkflowAsyncCompletionService;
import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class WorkflowWaitingWatchdogTest {

    @Test
    void expiresStaleExternalWaitingNodeButLeavesHumanApprovalUntouched() {
        RuntimeSnapshotRepository repository = mock(RuntimeSnapshotRepository.class);
        WorkflowAsyncCompletionService completionService = mock(WorkflowAsyncCompletionService.class);
        WorkflowRuntimeProperties properties = new WorkflowRuntimeProperties();
        properties.getRecovery().setWaitingTimeout(java.time.Duration.ofMinutes(1));
        WorkflowDefinitionDTO definition = new WorkflowDefinitionDTO();
        WorkflowNodeDTO ai = new WorkflowNodeDTO();
        ai.setNodeId("node-ai");
        ai.setNodeType("LLM");
        WorkflowNodeDTO human = new WorkflowNodeDTO();
        human.setNodeId("node-human");
        human.setNodeType("HUMAN");
        definition.setNodes(List.of(ai, human));
        WorkflowRuntimeSnapshot snapshot = new WorkflowRuntimeSnapshot(
                "101", "trace", "task", 1L, definition, RuntimeState.WAITING,
                List.of("node-ai", "node-human"), List.of(), List.of(), Map.of("userId", 7L),
                Map.of("node-ai", NodeResult.waiting(Map.of("externalTaskId", 90L)),
                        "node-human", NodeResult.waiting(Map.of())),
                Instant.now().minusSeconds(120));
        when(repository.findWaiting(org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.any()))
                .thenReturn(List.of(snapshot));

        WorkflowWaitingWatchdog watchdog = new WorkflowWaitingWatchdog(repository, completionService, properties);

        assertThat(watchdog.expireStaleWaitingWorkflows()).isEqualTo(1);
        verify(completionService).completeFailure(101L, "node-ai", "external AI completion timed out");
    }
}
