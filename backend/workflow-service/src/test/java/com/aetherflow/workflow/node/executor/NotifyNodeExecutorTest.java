package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.workflow.client.NotifyInternalClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotifyNodeExecutorTest {

    @Test
    void sendsWorkflowCompletionNotification() throws Exception {
        NotifyInternalClient notifyClient = mock(NotifyInternalClient.class);
        when(notifyClient.send(any(NotifyMessageDTO.class))).thenReturn(Result.success());
        NotifyNodeExecutor executor = new NotifyNodeExecutor(new WorkflowNodeMetrics(), notifyClient);

        NodeResult result = executor.execute(context(
                Map.of("userId", 7L, "eventType", "WORKFLOW_COMPLETED"),
                Map.of("summary", "Done")
        ));

        assertThat(result.output()).containsEntry("notified", true);
        ArgumentCaptor<NotifyMessageDTO> messageCaptor = ArgumentCaptor.forClass(NotifyMessageDTO.class);
        verify(notifyClient).send(messageCaptor.capture());
        NotifyMessageDTO message = messageCaptor.getValue();
        assertThat(message.getUserId()).isEqualTo(7L);
        assertThat(message.getChannel()).isEqualTo("WORKFLOW");
        assertThat(message.getEventType()).isEqualTo("WORKFLOW_COMPLETED");
        assertThat(message.getPayload())
                .containsEntry("workflowId", "workflow-1")
                .containsEntry("nodeId", "notify")
                .containsEntry("summary", "Done");
        assertThat(message.getOccurredAt()).isNotNull();
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("notify", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("notify");
        return context;
    }
}
