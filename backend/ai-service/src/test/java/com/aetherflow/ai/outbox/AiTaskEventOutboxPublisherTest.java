package com.aetherflow.ai.outbox;

import com.aetherflow.ai.callback.AiTaskCallbackService;
import com.aetherflow.ai.service.PythonMediaClient;
import com.aetherflow.ai.file.AiArtifactBatchCoordinator;
import com.aetherflow.ai.file.ArtifactRegistrationResult;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.FfmpegNodeExecutor;
import com.aetherflow.common.dto.AiMediaTransformResponseDTO;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.inOrder;

// pattern: Imperative Shell
class AiTaskEventOutboxPublisherTest {

    @Test
    void claimsPublishesAndMarksSuccessEventPublished() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper);
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult(
                "LLM", "SUCCEEDED", Map.of("completionText", "done"), List.of());
        AiTaskEventOutbox event = event(objectMapper.writeValueAsString(
                new AiTaskEventPayload(message, result, null)));
        when(mapper.claimForPublishing(eq(501L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);
        when(mapper.markPublishedOwned(eq(501L), anyString(), any(LocalDateTime.class)))
                .thenReturn(1);

        boolean published = publisher.publish(event);

        assertThat(published).isTrue();
        verify(callbackService).notifySuccess(eq(message), any(AiNodeResult.class));
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PUBLISHED);
        assertThat(event.getPublishedAt()).isNotNull();
        verify(mapper).markPublishedOwned(eq(501L), anyString(), any(LocalDateTime.class));
    }

    @Test
    void publishFailureReturnsEventToPendingWithBackoff() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper);
        TaskMessageDTO message = taskMessage();
        AiNodeResult result = new AiNodeResult(
                "LLM", "SUCCEEDED", Map.of("completionText", "done"), List.of());
        AiTaskEventOutbox event = event(objectMapper.writeValueAsString(
                new AiTaskEventPayload(message, result, null)));
        when(mapper.claimForPublishing(eq(501L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);
        when(mapper.markPublishedOwned(eq(501L), anyString(), any(LocalDateTime.class)))
                .thenReturn(1);
        doThrow(new IllegalStateException()).when(callbackService).notifySuccess(any(), any());
        LocalDateTime beforePublish = LocalDateTime.now();

        boolean published = publisher.publish(event);

        assertThat(published).isFalse();
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PENDING);
        assertThat(event.getAttemptCount()).isEqualTo(1);
        assertThat(event.getNextAttemptAt()).isAfter(beforePublish);
        assertThat(event.getLastError()).isEqualTo(
                "AI task outbox publish failed: IllegalStateException");
        verify(mapper).markRetryOwned(eq(501L), anyString(), any(LocalDateTime.class), anyInt(), anyString(), any(LocalDateTime.class));
    }

    @Test
    void commitsArtifactBatchBeforePublishingSuccessCallback() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        AiArtifactBatchCoordinator coordinator = mock(AiArtifactBatchCoordinator.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper, coordinator);
        TaskMessageDTO message = taskMessage();
        message.setUserId(1001L);
        AiNodeResult result = new AiNodeResult("ASR", "SUCCEEDED", Map.of(), List.of(),
                "ai-task:59:node-1:artifacts", 1);
        AiTaskEventOutbox event = event(objectMapper.writeValueAsString(
                new AiTaskEventPayload(message, result, null)));
        when(mapper.claimForPublishing(eq(501L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);

        publisher.publish(event);

        var ordered = inOrder(coordinator, callbackService);
        ordered.verify(coordinator).commit(event, new AiTaskEventPayload(message, result, null));
        ordered.verify(callbackService).notifySuccess(eq(message), eq(result));
    }

    @Test
    void restoresMp4MediaUrlAfterOutboxRoundTripAndRetry() throws Exception {
        AiTaskEventOutboxMapper mapper = mock(AiTaskEventOutboxMapper.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
        AiArtifactBatchCoordinator coordinator = mock(AiArtifactBatchCoordinator.class);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        AiTaskEventOutboxPublisher publisher = new AiTaskEventOutboxPublisher(
                mapper, callbackService, objectMapper, coordinator);
        TaskMessageDTO message = taskMessage();
        message.setUserId(1001L);
        message.setNodeType("FFMPEG");
        message.setPayload(Map.of("fileUrl", "https://files.test/source/input.mp4",
                "operation", "convert", "outputFormat", "mp4"));
        PythonMediaClient mediaClient = mock(PythonMediaClient.class);
        AiMediaTransformResponseDTO transform = new AiMediaTransformResponseDTO();
        transform.setFileName("converted.mp4");
        transform.setContentType("video/mp4");
        transform.setContentBase64(Base64.getEncoder().encodeToString(new byte[]{1, 2, 3}));
        when(mediaClient.transform(any())).thenReturn(transform);
        AiNodeResult executed = new FfmpegNodeExecutor(mediaClient).execute(
                new AiNodeExecutionContext(message, message.getPayload()));
        AiNodeResult staged = executed.withStoredArtifactFiles(new ArtifactRegistrationResult(
                "batch-mp4", 1, List.of(metadata(81L, "converted.mp4", "video/mp4", null))));
        assertThat(staged.output()).doesNotContainKey("mediaUrl");
        assertThat(staged.output()).containsKey("artifactTypeBindings");
        AiTaskEventPayload payload = new AiTaskEventPayload(message, staged, null);
        String serialized = objectMapper.writeValueAsString(payload);
        AiTaskEventPayload restored = objectMapper.readValue(serialized, AiTaskEventPayload.class);
        assertThat(restored.result().artifacts()).isEmpty();
        assertThat(restored.result().output()).containsKey("artifactTypeBindings");

        AiTaskEventOutbox event = event(serialized);
        List<FileMetadataDTO> committed = List.of(metadata(
                82L, "converted.mp4", "video/mp4", "https://files.test/transformed/converted.mp4"));
        when(mapper.claimForPublishing(eq(501L), anyString(), any(LocalDateTime.class), any(LocalDateTime.class)))
                .thenReturn(1);
        when(mapper.markPublishedOwned(eq(501L), anyString(), any(LocalDateTime.class))).thenReturn(1);
        when(coordinator.commit(eq(event), any(AiTaskEventPayload.class))).thenReturn(committed);
        AtomicInteger callbackAttempts = new AtomicInteger();
        List<AiNodeResult> callbacks = new ArrayList<>();
        org.mockito.Mockito.doAnswer(invocation -> {
            AiNodeResult callback = invocation.getArgument(1);
            callbacks.add(callback);
            if (callbackAttempts.getAndIncrement() == 0) throw new IllegalStateException("delayed callback retry");
            return null;
        }).when(callbackService).notifySuccess(eq(message), any(AiNodeResult.class));

        assertThat(publisher.publish(event)).isFalse();
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PENDING);
        assertThat(publisher.publish(event)).isTrue();
        assertThat(event.getStatus()).isEqualTo(AiTaskEventOutbox.PUBLISHED);
        assertThat(callbacks).hasSize(2);
        for (AiNodeResult callback : callbacks) {
            assertThat(callback.output()).containsEntry("mediaUrl", "https://files.test/transformed/converted.mp4");
            assertThat(callback.output().get("artifactFiles")).isInstanceOf(List.class);
        }
    }

    @Test
    void keepsMediaFormatsSubtitleAndImageAliasesAfterStagedSerialization() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        for (String extension : List.of("wav", "mp3", "m4a", "aac", "mp4")) {
            String fileName = "transformed." + extension;
            AiNodeResult staged = new AiNodeResult("FFMPEG", "SUCCEEDED", Map.of(),
                    List.of(new AiArtifact("MEDIA", fileName, "video/mp4", new byte[]{1})))
                    .withStoredArtifactFiles(new ArtifactRegistrationResult(
                            "batch-" + extension, 1, List.of(metadata(90L, fileName, "video/mp4", null))));
            AiNodeResult restored = objectMapper.readValue(objectMapper.writeValueAsString(staged), AiNodeResult.class);
            AiNodeResult committed = restored.withStoredArtifactFiles(new ArtifactRegistrationResult(
                    "batch-" + extension, 1, List.of(metadata(91L, fileName, "video/mp4",
                    "https://files.test/transformed/" + fileName))));

            assertThat(committed.output()).containsEntry("mediaUrl", "https://files.test/transformed/" + fileName);
        }

        // Backward compatibility for outbox payloads created before typed artifact
        // bindings were retained: the committed original filename still restores MP4.
        AiNodeResult oldPayload = new AiNodeResult("FFMPEG", "SUCCEEDED",
                Map.of("mediaContentType", "video/mp4"), List.of(), "legacy-batch", 1);
        AiNodeResult restoredLegacy = objectMapper.readValue(
                objectMapper.writeValueAsString(oldPayload), AiNodeResult.class);
        AiNodeResult committedLegacy = restoredLegacy.withStoredArtifactFiles(new ArtifactRegistrationResult(
                "legacy-batch", 1, List.of(metadata(96L, "legacy.mp4", "video/mp4", "https://files.test/legacy.mp4"))));
        assertThat(committedLegacy.output()).containsEntry("mediaUrl", "https://files.test/legacy.mp4");

        AiNodeResult stagedArtifacts = new AiNodeResult("WHISPER", "SUCCEEDED", Map.of(), List.of(
                new AiArtifact("SUBTITLE", "captions.srt", "text/plain", new byte[]{1}),
                new AiArtifact("SUBTITLE", "captions.vtt", "text/vtt", new byte[]{3}),
                new AiArtifact("IMAGE", "frame.png", "image/png", new byte[]{2})))
                .withStoredArtifactFiles(new ArtifactRegistrationResult("batch-mixed", 3, List.of(
                        metadata(92L, "captions.srt", "text/plain", null),
                        metadata(93L, "captions.vtt", "text/vtt", null),
                        metadata(94L, "frame.png", "image/png", null))));
        AiNodeResult committedArtifacts = objectMapper.readValue(
                objectMapper.writeValueAsString(stagedArtifacts), AiNodeResult.class)
                .withStoredArtifactFiles(new ArtifactRegistrationResult("batch-mixed", 3, List.of(
                        metadata(95L, "captions.srt", "text/plain", "https://files.test/captions.srt"),
                        metadata(96L, "captions.vtt", "text/vtt", "https://files.test/captions.vtt"),
                        metadata(97L, "frame.png", "image/png", "https://files.test/frame.png"))));

        assertThat(committedArtifacts.output()).containsEntry("srtUrl", "https://files.test/captions.srt")
                .containsEntry("vttUrl", "https://files.test/captions.vtt")
                .containsEntry("imageUrls", List.of("https://files.test/frame.png"));
    }

    private FileMetadataDTO metadata(Long id, String name, String contentType, String url) {
        return new FileMetadataDTO(id, "aetherflow", "generated/" + name, name, contentType, 3L, url);
    }

    private AiTaskEventOutbox event(String payloadJson) {
        AiTaskEventOutbox event = new AiTaskEventOutbox();
        event.setId(501L);
        event.setAiJobId(100L);
        event.setTaskId(59L);
        event.setEventId("ai-task:59:node-1:AI_TASK_SUCCEEDED");
        event.setEventType("AI_TASK_SUCCEEDED");
        event.setPayloadJson(payloadJson);
        event.setStatus(AiTaskEventOutbox.PENDING);
        event.setAttemptCount(0);
        event.setNextAttemptAt(LocalDateTime.now());
        event.setCreatedAt(LocalDateTime.now());
        event.setUpdatedAt(LocalDateTime.now());
        return event;
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(101L);
        message.setTraceId("trace-59");
        message.setNodeId("node-1");
        message.setNodeType("LLM");
        message.setPayload(Map.of("prompt", "summarize"));
        return message;
    }
}
