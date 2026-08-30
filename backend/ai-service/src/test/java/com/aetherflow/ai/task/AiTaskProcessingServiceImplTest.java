package com.aetherflow.ai.task;

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.outbox.AiTaskTerminalCoordinator;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.workflow.AiArtifact;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.retry.support.RetryTemplate;
import org.springframework.retry.support.RetrySynchronizationManager;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
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
                List.of(new AiArtifact("TXT", "outputs/result.txt", "text/plain"))
        );
        when(executorRegistry.getRequired("LLM")).thenReturn(executor);
        when(executor.execute(any(AiNodeExecutionContext.class))).thenReturn(result);
        AiJob completedJob = new AiJob();
        completedJob.setTaskId(59L);
        completedJob.setIdempotencyKey("59:node-1");
        completedJob.setStatus(AiTaskStatus.SUCCEEDED);
        when(aiJobMapper.selectOne(any())).thenReturn(null, completedJob);
        doAnswer(invocation -> {
            AiJob job = invocation.getArgument(0);
            job.setId(100L);
            return 1;
        }).when(aiJobMapper).insert(any(AiJob.class));
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper()
        );
        TaskMessageDTO message = taskMessage();

        service.process(message);
        service.process(message);

        verify(aiJobMapper).insert(any(AiJob.class));
        verify(executor).execute(any(AiNodeExecutionContext.class));
        verify(fileRegistrationService).registerArtifacts(result.artifacts());
        verify(terminalCoordinator).recordSuccess(any(AiJob.class), eq(message), eq(result));
        verify(terminalCoordinator).publishPending(completedJob);
    }

    @Test
    void duplicateConcurrentTaskMessageDoesNotRunWhenIdempotencyInsertLosesRace() {
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
        when(aiJobMapper.selectOne(any())).thenReturn(null);
        doAnswer(invocation -> {
            throw new DuplicateKeyException("duplicate idempotency key");
        }).when(aiJobMapper).insert(any(AiJob.class));
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
                executorRegistry,
                cacheService,
                fileRegistrationService,
                terminalCoordinator,
                sentinelAiGuard,
                new ObjectMapper()
        );

        service.process(taskMessage());

        verify(executorRegistry, never()).getRequired(any());
        verify(fileRegistrationService, never()).registerArtifacts(any());
        verify(terminalCoordinator, never()).recordSuccess(any(), any(), any());
        verify(terminalCoordinator, never()).recordFailure(any(), any(), any());
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
        when(aiJobMapper.selectOne(any())).thenReturn(failedJob);
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper, executorRegistry, cacheService, fileRegistrationService,
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
        AiJob retryingJob = new AiJob();
        retryingJob.setId(100L);
        retryingJob.setTaskId(59L);
        retryingJob.setIdempotencyKey("59:node-1");
        retryingJob.setStatus(AiTaskStatus.RETRYING);
        when(aiJobMapper.selectOne(any())).thenReturn(null, retryingJob);
        doAnswer(invocation -> {
            AiJob job = invocation.getArgument(0);
            job.setId(100L);
            return 1;
        }).when(aiJobMapper).insert(any(AiJob.class));
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
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

        verify(terminalCoordinator, never()).recordFailure(any(), any(), any());
        verify(terminalCoordinator).recordSuccess(any(AiJob.class), eq(message), eq(successfulResult));
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
        AiJob retryingJob = new AiJob();
        retryingJob.setId(100L);
        retryingJob.setTaskId(59L);
        retryingJob.setIdempotencyKey("59:node-1");
        retryingJob.setStatus(AiTaskStatus.RETRYING);
        when(aiJobMapper.selectOne(any())).thenReturn(null, retryingJob, retryingJob);
        doAnswer(invocation -> {
            AiJob job = invocation.getArgument(0);
            job.setId(100L);
            return 1;
        }).when(aiJobMapper).insert(any(AiJob.class));
        List<Integer> failureCallbackRetryCounts = new ArrayList<>();
        doAnswer(invocation -> {
            failureCallbackRetryCounts.add(RetrySynchronizationManager.getContext().getRetryCount());
            invocation.getArgument(0, AiJob.class).setStatus(AiTaskStatus.FAILED);
            return null;
        }).when(terminalCoordinator).recordFailure(any(), any(), any());
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
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

        verify(terminalCoordinator).recordFailure(any(AiJob.class), eq(message), eq("provider unavailable"));
        verify(cacheService).markStatus(59L, AiTaskStatus.FAILED);
        assertThat(failureCallbackRetryCounts).containsExactly(2);
        assertThat(retryingJob.getStatus()).isEqualTo(AiTaskStatus.FAILED);
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
        when(aiJobMapper.selectOne(any())).thenReturn(null);
        doAnswer(invocation -> {
            AiJob job = invocation.getArgument(0);
            job.setId(100L);
            return 1;
        }).when(aiJobMapper).insert(any(AiJob.class));
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper,
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
                any(AiJob.class), eq(message), eq("AI task failed: IllegalStateException"));
    }

    private static TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(100L);
        message.setNodeId("node-1");
        message.setNodeType("LLM");
        message.setPayload(Map.of("prompt", "summarize"));
        return message;
    }
}
