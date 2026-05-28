package com.aetherflow.workflow.node.executor;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.workflow.client.AiWorkflowNodeClient;
import com.aetherflow.workflow.node.WorkflowNodeContextKeys;
import com.aetherflow.workflow.node.WorkflowNodeProperties;
import com.aetherflow.workflow.node.metrics.WorkflowNodeMetrics;
import com.aetherflow.workflow.runtime.api.NodeResult;
import com.aetherflow.workflow.runtime.core.DefaultWorkflowContext;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WhisperNodeExecutorTest {

    @Test
    void callsAiServiceAndWritesTranscriptionVariables() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        properties.setDefaultWhisperLanguage("auto");
        WhisperNodeExecutor executor = new WhisperNodeExecutor(new WorkflowNodeMetrics(), aiClient, properties);
        when(aiClient.execute(argThat(request -> "WHISPER".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "WHISPER",
                        "SUCCEEDED",
                        Map.of("text", "hello world", "durationSeconds", 3.2)
                )));

        NodeResult result = executor.execute(context(Map.of("prompt", "domain terms"),
                Map.of("fileUrl", "http://minio/audio.mp3")));

        assertThat(result.output()).containsEntry("text", "hello world");
        assertThat(result.variables()).containsEntry("transcription", "hello world");
        assertThat(result.variables()).containsEntry("durationSeconds", 3.2);
        verify(aiClient).execute(argThat(request ->
                "WHISPER".equals(request.getNodeType())
                        && "http://minio/audio.mp3".equals(request.getPayload().get("fileUrl"))
                        && "auto".equals(request.getPayload().get("language"))
        ));
    }

    @Test
    void readsFileUrlFromConfiguredVariableName() throws Exception {
        AiWorkflowNodeClient aiClient = mock(AiWorkflowNodeClient.class);
        WorkflowNodeProperties properties = new WorkflowNodeProperties();
        WhisperNodeExecutor executor = new WhisperNodeExecutor(new WorkflowNodeMetrics(), aiClient, properties);
        when(aiClient.execute(argThat(request -> "WHISPER".equals(request.getNodeType()))))
                .thenReturn(Result.success(new AiWorkflowNodeResponseDTO(
                        "WHISPER",
                        "SUCCEEDED",
                        Map.of("text", "hello world")
                )));

        NodeResult result = executor.execute(context(Map.of("fileUrlVariable", "sourceFileUrl"),
                Map.of("sourceFileUrl", "http://minio/audio.mp3")));

        assertThat(result.variables()).containsEntry("transcription", "hello world");
        verify(aiClient).execute(argThat(request ->
                "http://minio/audio.mp3".equals(request.getPayload().get("fileUrl"))
        ));
    }

    private static DefaultWorkflowContext context(Map<String, Object> config, Map<String, Object> variables) {
        Map<String, Object> initialVariables = new LinkedHashMap<>(variables);
        initialVariables.put(WorkflowNodeContextKeys.NODE_CONFIGS, Map.of("whisper", config));
        DefaultWorkflowContext context = new DefaultWorkflowContext("workflow-1", "trace-1", "task-1", initialVariables);
        context.updateCurrentNodeId("whisper");
        return context;
    }
}
