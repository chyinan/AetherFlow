package com.aetherflow.ai.task;

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.callback.AiTaskCallbackService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.mapper.AiJobMapper;
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

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiTaskProcessingServiceImplTest {

    @Test
    void duplicateSucceededTaskMessageDoesNotRepeatSideEffects() throws Exception {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
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
                callbackService,
                sentinelAiGuard,
                new ObjectMapper()
        );
        TaskMessageDTO message = taskMessage();

        service.process(message);
        service.process(message);

        verify(aiJobMapper).insert(any(AiJob.class));
        verify(executor).execute(any(AiNodeExecutionContext.class));
        verify(fileRegistrationService).registerArtifacts(result.artifacts());
        verify(callbackService).notifySuccess(message, result);
    }

    @Test
    void duplicateConcurrentTaskMessageDoesNotRunWhenIdempotencyInsertLosesRace() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        DefaultAiNodeExecutorRegistry executorRegistry = mock(DefaultAiNodeExecutorRegistry.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskCallbackService callbackService = mock(AiTaskCallbackService.class);
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
                callbackService,
                sentinelAiGuard,
                new ObjectMapper()
        );

        service.process(taskMessage());

        verify(executorRegistry, never()).getRequired(any());
        verify(fileRegistrationService, never()).registerArtifacts(any());
        verify(callbackService, never()).notifySuccess(any(), any());
        verify(callbackService, never()).notifyFailure(any(), any());
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
