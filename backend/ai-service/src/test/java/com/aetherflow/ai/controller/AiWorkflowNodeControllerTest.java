package com.aetherflow.ai.controller;

import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.ai.capability.AiWorkflowCapabilityService;
import com.aetherflow.ai.config.AiInternalProperties;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiWorkflowNodeRequestDTO;
import com.aetherflow.common.dto.AiWorkflowNodeResponseDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.common.security.InternalServiceTokenService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.time.Duration;
import java.time.Instant;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.any;

class AiWorkflowNodeControllerTest {

    @Test
    void routesWhisperToAsrExecutor() {
        AiNodeExecutor asrExecutor = new StubExecutor("ASR", "hello world");
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(asrExecutor)), mock(AiWorkflowCapabilityService.class),
                mock(AiFileRegistrationService.class), properties()
        );

        AiWorkflowNodeRequestDTO request = request("WHISPER", Map.of(
                "fileUrl", "http://minio/audio.mp3",
                "language", "auto",
                "prompt", ""
        ));

        Result<AiWorkflowNodeResponseDTO> result = controller.execute(token(), request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getNodeType()).isEqualTo("WHISPER");
        assertThat(result.getData().getOutput()).containsEntry("text", "hello world");
    }

    @Test
    void routesSummaryThroughSummaryExecutor() {
        AiNodeExecutor summaryExecutor = new StubExecutor("SUMMARY", "short summary");
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(summaryExecutor)), mock(AiWorkflowCapabilityService.class),
                mock(AiFileRegistrationService.class), properties()
        );

        AiWorkflowNodeRequestDTO request = request("SUMMARY", Map.of(
                "text", "long content",
                "language", "Chinese",
                "prompt", "Focus on actions"
        ));

        Result<AiWorkflowNodeResponseDTO> result = controller.execute(token(), request);

        assertThat(result.isSuccess()).isTrue();
        assertThat(result.getData().getNodeType()).isEqualTo("SUMMARY");
        assertThat(result.getData().getOutput()).containsEntry("summary", "short summary");
    }

    @Test
    void rejectsMissingInternalToken() {
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(new StubExecutor("ASR", "hello"))),
                mock(AiWorkflowCapabilityService.class), mock(AiFileRegistrationService.class), properties()
        );

        try {
            controller.execute(null, request("WHISPER", Map.of()));
        } catch (BusinessException exception) {
            assertThat(exception.getErrorCode()).isEqualTo(ResultCode.FORBIDDEN);
            return;
        }
        throw new AssertionError("expected missing internal token to be rejected");
    }

    @Test
    void rejectsArtifactProducingSynchronousExecutionWithoutFencedJobLease() {
        AiNodeExecutor executor = new ArtifactExecutor();
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiWorkflowNodeController controller = new AiWorkflowNodeController(
                new DefaultAiNodeExecutorRegistry(List.of(executor)), mock(AiWorkflowCapabilityService.class),
                fileRegistrationService, properties());
        AiWorkflowNodeRequestDTO request = request("ASR", Map.of("fileUrl", "http://minio/audio.mp3"));

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> controller.execute(token(), request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("fenced asynchronous execution");
        verify(fileRegistrationService, never()).registerArtifacts(any(), any(), any());
    }

    private static AiInternalProperties properties() {
        AiInternalProperties properties = new AiInternalProperties();
        properties.setInternalToken("0123456789abcdef0123456789abcdef");
        return properties;
    }

    private static String token() {
        return new InternalServiceTokenService(properties().getInternalToken(), "aetherflow-internal", Duration.ofMinutes(1))
                .issue("ai-service", Instant.now());
    }

    private static AiWorkflowNodeRequestDTO request(String nodeType, Map<String, Object> payload) {
        AiWorkflowNodeRequestDTO request = new AiWorkflowNodeRequestDTO();
        request.setWorkflowId("2002");
        request.setTraceId("trace-1");
        request.setTaskId("77");
        request.setUserId(1001L);
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

    private static final class ArtifactExecutor implements AiNodeExecutor {
        @Override
        public String nodeType() {
            return "ASR";
        }

        @Override
        public AiNodeResult execute(AiNodeExecutionContext context) {
            return new AiNodeResult("ASR", "SUCCEEDED", Map.of("text", "hello"), List.of(
                    new AiArtifact("SRT", "subtitle.srt", "text/plain",
                            "subtitle".getBytes(StandardCharsets.UTF_8))));
        }
    }
}
