package com.aetherflow.workflow.runtime.async;

import com.aetherflow.common.dto.NotifyMessageDTO;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.doThrow;

class WorkflowAiResultListenerTest {

    @Test
    void completesWaitingNodeFromAiSuccessEvent() {
        WorkflowAsyncCompletionService completionService = mock(WorkflowAsyncCompletionService.class);
        WorkflowAiResultListener listener = new WorkflowAiResultListener(completionService);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setEventType("AI_TASK_SUCCEEDED");
        message.setPayload(Map.of(
                "workflowInstanceId", 101L,
                "nodeId", "node-ai",
                "output", Map.of("summary", "done")));

        listener.handle(message);

        verify(completionService).completeSuccess(101L, "node-ai", Map.of("summary", "done"));
    }

    @Test
    void ignoresUnrelatedNotificationEvents() {
        WorkflowAsyncCompletionService completionService = mock(WorkflowAsyncCompletionService.class);
        WorkflowAiResultListener listener = new WorkflowAiResultListener(completionService);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setEventType("FILE_UPLOADED");
        message.setPayload(Map.of());

        listener.handle(message);

        verifyNoInteractions(completionService);
    }

    @Test
    void failsWaitingNodeFromAiFailureEvent() {
        WorkflowAsyncCompletionService completionService = mock(WorkflowAsyncCompletionService.class);
        WorkflowAiResultListener listener = new WorkflowAiResultListener(completionService);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setEventType("AI_TASK_FAILED");
        message.setPayload(Map.of(
                "workflowInstanceId", 101L,
                "nodeId", "node-ai",
                "error", "provider unavailable"));

        listener.handle(message);

        verify(completionService).completeFailure(101L, "node-ai", "provider unavailable");
    }

    @Test
    void acknowledgesStaleExternalTaskEventInsteadOfPoisoningTheQueue() {
        WorkflowAsyncCompletionService completionService = mock(WorkflowAsyncCompletionService.class);
        doThrow(new IllegalStateException("stale external AI completion ignored for node node-ai"))
                .when(completionService).completeSuccess(101L, "node-ai", 90L, Map.of("summary", "late"));
        WorkflowAiResultListener listener = new WorkflowAiResultListener(completionService);
        NotifyMessageDTO message = new NotifyMessageDTO();
        message.setEventType("AI_TASK_SUCCEEDED");
        message.setPayload(Map.of(
                "workflowInstanceId", 101L,
                "taskId", 90L,
                "nodeId", "node-ai",
                "output", Map.of("summary", "late")));

        listener.handle(message);

        verify(completionService).completeSuccess(101L, "node-ai", 90L, Map.of("summary", "late"));
    }
}
