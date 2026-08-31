package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.service.PythonMediaClient;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.common.dto.AiMediaTransformResponseDTO;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FfmpegNodeExecutorTest {

    @Test
    void executesRealTransformContractAndReturnsPersistableArtifact() {
        PythonMediaClient client = mock(PythonMediaClient.class);
        AiMediaTransformResponseDTO response = new AiMediaTransformResponseDTO();
        response.setFileName("transformed.wav");
        response.setContentType("audio/wav");
        response.setContentBase64(Base64.getEncoder().encodeToString(new byte[]{1, 2, 3}));
        when(client.transform(any())).thenReturn(response);
        FfmpegNodeExecutor executor = new FfmpegNodeExecutor(client);

        var result = executor.execute(new AiNodeExecutionContext(task(), Map.of(
                "fileUrl", "https://files.example/input.mp4",
                "operation", "extract-audio",
                "outputFormat", "wav")));

        assertThat(result.nodeType()).isEqualTo("FFMPEG");
        assertThat(result.artifacts()).singleElement().satisfies(artifact -> {
            assertThat(artifact.fileName()).isEqualTo("transformed.wav");
            assertThat(artifact.contentType()).isEqualTo("audio/wav");
            assertThat(artifact.content()).containsExactly(1, 2, 3);
        });
    }

    private com.aetherflow.common.dto.TaskMessageDTO task() {
        var task = new com.aetherflow.common.dto.TaskMessageDTO();
        task.setTaskId(77L);
        task.setWorkflowInstanceId(2002L);
        task.setNodeId("ffmpeg");
        task.setNodeType("FFMPEG");
        return task;
    }
}
