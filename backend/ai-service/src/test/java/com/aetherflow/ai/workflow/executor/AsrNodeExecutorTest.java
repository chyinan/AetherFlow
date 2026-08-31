package com.aetherflow.ai.workflow.executor;

import com.aetherflow.ai.service.PythonAsrClient;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AsrNodeExecutorTest {

    @Test
    void returnsSubtitleBytesForDurableArtifactStorageInsteadOfClaimingAnObjectKey() {
        PythonAsrClient pythonAsrClient = mock(PythonAsrClient.class);
        AiTranscriptionResponseDTO response = new AiTranscriptionResponseDTO();
        response.setText("hello");
        response.setDurationSeconds(1.0D);
        response.setSrtFileName("transcription.srt");
        response.setSrtContent("1\n00:00:00,000 --> 00:00:01,000\nhello\n");
        when(pythonAsrClient.transcribe(any())).thenReturn(response);

        AsrNodeExecutor executor = new AsrNodeExecutor(pythonAsrClient);
        TaskMessageDTO task = new TaskMessageDTO();
        task.setTaskId(77L);

        var result = executor.execute(new AiNodeExecutionContext(task, Map.of(
                "fileUrl", "http://minio/aetherflow/audio.wav",
                "language", "auto"
        )));

        assertThat(result.output()).containsEntry("text", "hello").containsEntry("durationSeconds", 1.0D);
        assertThat(result.output()).doesNotContainKey("srtObjectKey");
        assertThat(result.artifacts()).singleElement().satisfies(artifact -> {
            assertThat(artifact.type()).isEqualTo("SRT");
            assertThat(artifact.fileName()).isEqualTo("transcription.srt");
            assertThat(new String(artifact.content(), StandardCharsets.UTF_8)).contains("hello");
        });
    }
}
