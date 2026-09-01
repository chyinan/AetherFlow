package com.aetherflow.ai.task;

// pattern: Imperative Shell

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.file.ArtifactRegistrationResult;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.outbox.AiTaskTerminalCoordinator;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.dto.FileMetadataDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.retry.support.RetrySynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class AiTaskProcessingServiceImplTest {

    @Test
    void duplicateSucceededTaskMessageDoesNotRepeatSideEffects() throws Exception {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiNodeExecutor executor = mock(AiNodeExecutor.class);
        AiNodeResult result = new AiNodeResult(
                "LLM",
                "SUCCEEDED",
                Map.of("text", "done"),
                List.of(new AiArtifact("TXT", "result.txt", "text/plain", "done".getBytes(StandardCharsets.UTF_8)))
        );
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class))).thenReturn(result);
        AiJob completedJob = new AiJob();
        completedJob.setTaskId(59L);
        completedJob.setIdempotencyKey("59:node-1");
        completedJob.setStatus(AiTaskStatus.SUCCEEDED);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null, completedJob);
        stubInsertAndAuthoritativeRead(aiJobMapper);
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper()
        );
        TaskMessageDTO message = taskMessage();
        FileMetadataDTO storedFile = new FileMetadataDTO(
                901L, "aetherflow", "generated/result.txt", "result.txt", "text/plain", 4L,
                "https://files.example/result.txt"
        );
        when(fileRegistrationService.registerArtifacts(eq(message), any(AiJobLease.class), eq(result.artifacts())))
                .thenReturn(new ArtifactRegistrationResult("ai-task:59:node-1:artifacts", 1, List.of(storedFile)));

        service.process(message);
        service.process(message);

        verify(aiJobMapper).insertAiJobWithLease(any(AiJob.class), anyLong());
        verify(executor).execute(any(AiNodeExecutionContext.class));
        verify(fileRegistrationService).registerArtifacts(eq(message), any(AiJobLease.class), eq(result.artifacts()));
        var resultCaptor = org.mockito.ArgumentCaptor.forClass(AiNodeResult.class);
        verify(terminalCoordinator).recordSuccess(
                any(AiJob.class), any(AiJobLease.class), eq(message), resultCaptor.capture());
        assertThat(resultCaptor.getValue().artifacts()).isEmpty();
        assertThat(resultCaptor.getValue().output()).containsEntry("artifactFiles", List.of(storedFile));
        var ordered = inOrder(fileRegistrationService, terminalCoordinator);
        ordered.verify(fileRegistrationService).registerArtifacts(eq(message), any(AiJobLease.class), eq(result.artifacts()));
        ordered.verify(terminalCoordinator).recordSuccess(
                any(AiJob.class), any(AiJobLease.class), eq(message), any(AiNodeResult.class));
        verify(terminalCoordinator).publishPending(completedJob);
    }

    @Test
    void duplicateConcurrentTaskMessageReturnsBusyLeaseForDurableRedelivery() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiJob racedJob = new AiJob();
        racedJob.setId(100L);
        racedJob.setIdempotencyKey("59:node-1");
        racedJob.setStatus(AiTaskStatus.RUNNING);
        racedJob.setLeaseToken("lease-owner");
        racedJob.setLeaseExpiresAt(LocalDateTime.now().plusMinutes(1));
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null, racedJob);
        doAnswer(invocation -> {
            throw new DuplicateKeyException("duplicate idempotency key");
        }).when(aiJobMapper).insertAiJobWithLease(any(AiJob.class), anyLong());
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper()
        );

        Throwable busy = catchThrowable(() -> service.process(taskMessage()));

        assertThat(busy).isInstanceOf(AiJobLeaseBusyException.class);
        verify(executorRegistry, never()).getRequired(any());
        verify(fileRegistrationService, never()).registerArtifacts(any(), any(), any());
        verify(terminalCoordinator, never()).recordSuccess(any(), any(), any(), any());
        verify(terminalCoordinator, never()).recordFailure(any(), any(), any(), any());
    }

    @Test
    void artifactStorageFailureCannotPublishTerminalSuccess() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiNodeExecutor executor = mock(AiNodeExecutor.class);
        AiNodeResult result = new AiNodeResult(
                "ASR",
                "SUCCEEDED",
                Map.of("text", "hello"),
                List.of(new AiArtifact("SRT", "transcription.srt", "text/plain",
                        "subtitle".getBytes(StandardCharsets.UTF_8)))
        );
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class))).thenReturn(result);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null);
        stubInsertAndAuthoritativeRead(aiJobMapper);
        TaskMessageDTO message = taskMessage();
        when(fileRegistrationService.registerArtifacts(eq(message), any(AiJobLease.class), eq(result.artifacts())))
                .thenThrow(new IllegalStateException("file-service unavailable"));
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper, new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry, cacheService, fileRegistrationService,
                terminalCoordinator, sentinelAiGuard, new ObjectMapper());

        Throwable failure = catchThrowable(() -> service.process(message));

        assertThat(failure).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("file-service unavailable");
        verify(terminalCoordinator, never()).recordSuccess(any(), any(), any(), any());
        verify(terminalCoordinator).recordFailure(
                any(AiJob.class), any(AiJobLease.class), eq(message), eq("file-service unavailable"));
    }

    @Test
    void duplicateFailedTaskMessageDoesNotRerunModel() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiJob failedJob = new AiJob();
        failedJob.setId(100L);
        failedJob.setTaskId(59L);
        failedJob.setIdempotencyKey("59:node-1");
        failedJob.setStatus(AiTaskStatus.FAILED);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(failedJob);
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper, new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry, cacheService, fileRegistrationService,
                terminalCoordinator, sentinelAiGuard, new ObjectMapper());

        service.process(taskMessage());

        verify(terminalCoordinator).publishPending(failedJob);
        verify(executorRegistry, never()).getRequired(any());
        verify(aiJobMapper, never()).updateById(any(AiJob.class));
    }

    @Test
    void retryableFailureDoesNotPublishTerminalFailureBeforeLaterSuccess() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiNodeExecutor executor = mock(AiNodeExecutor.class);
        AiNodeResult successfulResult = new AiNodeResult("LLM", "SUCCEEDED", Map.of("text", "done"), List.of());
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class)))
                .thenThrow(new IllegalStateException())
                .thenReturn(successfulResult);
        when(fileRegistrationService.registerArtifacts(
                any(TaskMessageDTO.class), any(AiJobLease.class), eq(List.of())))
                .thenReturn(ArtifactRegistrationResult.empty());
        AtomicReference<AiJob> retryJobRef = stubInsertAndAuthoritativeRead(aiJobMapper);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString()))
                .thenReturn(null)
                .thenAnswer(invocation -> retryJobRef.get());
        when(aiJobMapper.markAiJobRetryingWithLease(any(), anyString(), anyString()))
                .thenReturn(1);
        when(aiJobMapper.claimAiJobLease(any(), anyString(), anyLong()))
                .thenAnswer(invocation -> {
                    AiJob job = retryJobRef.get();
                    job.setLeaseToken(invocation.getArgument(1));
                    job.setLeaseExpiresAt(LocalDateTime.now().plusMinutes(2));
                    job.setAttemptCount(job.getAttemptCount() + 1);
                    job.setStatus(AiTaskStatus.RUNNING);
                    return 1;
                });
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper());
        TaskMessageDTO message = taskMessage();
        RetryTemplate retryTemplate = RetryTemplate.builder()
                .maxAttempts(3)
                .fixedBackoff(1)
                .retryOn(IllegalStateException.class)
                .build();

        retryTemplate.execute(context -> {
            service.process(message);
            return null;
        });

        verify(terminalCoordinator, never()).recordFailure(any(), any(), any(), any());
        verify(terminalCoordinator).recordSuccess(
                any(AiJob.class), any(AiJobLease.class), eq(message), eq(successfulResult));
    }

    @Test
    void publishesTerminalFailureExactlyOnceAfterRetriesAreExhausted() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiNodeExecutor executor = mock(AiNodeExecutor.class);
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class)))
                .thenThrow(new IllegalStateException("provider unavailable"));
        AtomicReference<AiJob> failingJobRef = stubInsertAndAuthoritativeRead(aiJobMapper);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString()))
                .thenReturn(null)
                .thenAnswer(invocation -> failingJobRef.get());
        when(aiJobMapper.markAiJobRetryingWithLease(any(), anyString(), anyString()))
                .thenReturn(1);
        when(aiJobMapper.claimAiJobLease(any(), anyString(), anyLong()))
                .thenAnswer(invocation -> {
                    AiJob job = failingJobRef.get();
                    job.setLeaseToken(invocation.getArgument(1));
                    job.setLeaseExpiresAt(LocalDateTime.now().plusMinutes(2));
                    job.setAttemptCount(job.getAttemptCount() + 1);
                    job.setStatus(AiTaskStatus.RUNNING);
                    return 1;
                });
        List<Integer> failureCallbackRetryCounts = new ArrayList<>();
        doAnswer(invocation -> {
            failureCallbackRetryCounts.add(RetrySynchronizationManager.getContext().getRetryCount());
            invocation.getArgument(0, AiJob.class).setStatus(AiTaskStatus.FAILED);
            return null;
        }).when(terminalCoordinator).recordFailure(any(), any(), any(), any());
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper());
        TaskMessageDTO message = taskMessage();
        RetryTemplate retryTemplate = RetryTemplate.builder()
                .maxAttempts(3)
                .fixedBackoff(1)
                .retryOn(IllegalStateException.class)
                .build();

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> retryTemplate.execute(context -> {
                    service.process(message);
                    return null;
                }))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("provider unavailable");

        verify(terminalCoordinator).recordFailure(
                any(AiJob.class), any(AiJobLease.class), eq(message), eq("provider unavailable"));
        verify(cacheService).markStatus(59L, AiTaskStatus.FAILED);
        assertThat(failureCallbackRetryCounts).containsExactly(2);
        assertThat(failingJobRef.get().getStatus()).isEqualTo(AiTaskStatus.FAILED);
    }

    @Test
    void nullExceptionMessageUsesSafeTerminalErrorWithoutReplacingOriginalFailure() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        AiNodeExecutor executor = mock(AiNodeExecutor.class);
        IllegalStateException originalFailure = new IllegalStateException();
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class))).thenThrow(originalFailure);
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null);
        stubInsertAndAuthoritativeRead(aiJobMapper);
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper());
        TaskMessageDTO message = taskMessage();

        Throwable thrown = catchThrowable(() -> service.process(message));

        assertThat(thrown).isSameAs(originalFailure);
        verify(cacheService).cacheError(59L, "AI task failed: IllegalStateException");
        verify(terminalCoordinator).recordFailure(
                any(AiJob.class), any(AiJobLease.class), eq(message),
                eq("AI task failed: IllegalStateException"));
    }

    private static TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(100L);
        message.setUserId(7L);
        message.setNodeId("node-1");
        message.setNodeType("LLM");
        message.setPayload(Map.of("prompt", "summarize"));
        return message;
    }

    private static AtomicReference<AiJob> stubInsertAndAuthoritativeRead(AiJobMapper mapper) {
        AtomicReference<AiJob> stored = new AtomicReference<>();
        doAnswer(invocation -> {
            AiJob job = invocation.getArgument(0, AiJob.class);
            job.setId(100L);
            job.setStatus(AiTaskStatus.RUNNING);
            job.setLeaseExpiresAt(LocalDateTime.now().plusMinutes(2));
            job.setLastHeartbeatAt(LocalDateTime.now());
            job.setAttemptCount(1);
            stored.set(job);
            return 1;
        }).when(mapper).insertAiJobWithLease(any(AiJob.class), anyLong());
        when(mapper.selectById(100L)).thenAnswer(invocation -> stored.get());
        return stored;
    }
}
