package com.aetherflow.workflow.node.executor;

// pattern: Imperative Shell

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.config.TaskClientProperties;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AsyncAiTaskDispatcherTest {

    @Test
    void dispatchesTraceableAiTaskThroughTaskService() {
        TaskClient taskClient = mock(TaskClient.class);
        TaskClientProperties credentials = new TaskClientProperties();
        credentials.setInternalToken("0123456789abcdef0123456789abcdef");
        WorkflowNodeProperties nodeProperties = new WorkflowNodeProperties();
        nodeProperties.setAsyncAiEnabled(true);
        AsyncAiTaskDispatcher dispatcher = new AsyncAiTaskDispatcher(taskClient, credentials, nodeProperties);
        when(taskClient.dispatch(any(String.class), any(TaskMessageDTO.class))).thenReturn(Result.success(91L));
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "101", "trace-101", "101", Map.of("userId", 7L));
        context.updateCurrentNodeId("node-ai");

        long taskId = dispatcher.dispatch(context, "LLM", Map.of("prompt", "summarize"));

        assertThat(taskId).isEqualTo(91L);
        ArgumentCaptor<TaskMessageDTO> message = ArgumentCaptor.forClass(TaskMessageDTO.class);
        verify(taskClient).dispatch(any(String.class), message.capture());
        assertThat(message.getValue().getWorkflowInstanceId()).isEqualTo(101L);
        assertThat(message.getValue().getTraceId()).isEqualTo("trace-101");
        assertThat(message.getValue().getNodeId()).isEqualTo("node-ai");
        assertThat(message.getValue().getEnqueue()).isTrue();
    }

    @Test
    void whisperNodeTypeIsDispatchedUnchangedSoTheWorkerCanResolveIt() {
        TaskClient taskClient = mock(TaskClient.class);
        TaskClientProperties credentials = new TaskClientProperties();
        credentials.setInternalToken("0123456789abcdef0123456789abcdef");
        WorkflowNodeProperties nodeProperties = new WorkflowNodeProperties();
        nodeProperties.setAsyncAiEnabled(true);
        AsyncAiTaskDispatcher dispatcher = new AsyncAiTaskDispatcher(taskClient, credentials, nodeProperties);
        when(taskClient.dispatch(any(String.class), any(TaskMessageDTO.class))).thenReturn(Result.success(92L));
        DefaultWorkflowContext context = new DefaultWorkflowContext(
                "101", "trace-101", "101", Map.of("userId", 7L));
        context.updateCurrentNodeId("node-whisper");

        long taskId = dispatcher.dispatch(context, "WHISPER", Map.of("fileUrl", "http://minio/aetherflow/audio.mp3"));

        assertThat(taskId).isEqualTo(92L);
        ArgumentCaptor<TaskMessageDTO> message = ArgumentCaptor.forClass(TaskMessageDTO.class);
        verify(taskClient).dispatch(any(String.class), message.capture());
        // 持久化任务的原始类型保持 WHISPER，任务标识与幂等键语义不变。
        assertThat(message.getValue().getNodeType()).isEqualTo("WHISPER");
        assertThat(message.getValue().getTaskId()).isNull();
        assertThat(message.getValue().getIdempotencyKey())
                .isEqualTo("workflow-ai:101:trace-101:node-whisper:WHISPER:root");
        assertThat(message.getValue().getPayload()).containsEntry("fileUrl", "http://minio/aetherflow/audio.mp3");
    }
}
