package com.aetherflow.ai.controller;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AiWorkflowNodeControllerTest {

    @Test
    void routesWhisperToAsrExecutor() {
        AiNodeExecutor asrExecutor = new StubExecutor("ASR", "hello world");
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(asrExecutor))
        );

        AiWorkflowNodeRequestDTO request = request("WHISPER", Map.of(
                "fileUrl", "http://minio/audio.mp3",
                "language", "auto",
                "prompt", ""
        ));

        Result<AiWorkflowNodeResponseDTO> result = controller.execute(request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getNodeType()).isEqualTo("WHISPER");
        assertThat(result.getData().getOutput()).containsEntry("text", "hello world");
    }

    @Test
    void routesSummaryThroughSummaryExecutor() {
        AiNodeExecutor summaryExecutor = new StubExecutor("SUMMARY", "short summary");
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(summaryExecutor))
        );

        AiWorkflowNodeRequestDTO request = request("SUMMARY", Map.of(
                "text", "long content",
                "language", "Chinese",
                "prompt", "Focus on actions"
        ));

        Result<AiWorkflowNodeResponseDTO> result = controller.execute(request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getNodeType()).isEqualTo("SUMMARY");
        assertThat(result.getData().getOutput()).containsEntry("summary", "short summary");
    }

    private static AiWorkflowNodeRequestDTO request(String nodeType, Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId("workflow-1");
        request.setTraceId("trace-1");
        request.setTaskId("task-1");
        request.setNodeId("node-1");
        request.setNodeType(nodeType);
        request.setPayload(payload);
        return request;
    }

    private record StubExecutor(String nodeType, String value) implements AiNodeExecutor {
        @Override
        public String nodeType() {
            return nodeType;
        }

        @Override
        public AiNodeResult execute(AiNodeExecutionContext context) {
            return new AiNodeResult(nodeType, "SUCCEEDED", Map.of(
                    "text", value,
                    "summary", value
            ), List.of());
        }
    }
}
