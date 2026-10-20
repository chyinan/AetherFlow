package com.aetherflow.ai.task;

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.client.TaskStatusClient;
import com.aetherflow.ai.config.TaskClientProperties;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.file.ArtifactRegistrationResult;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.outbox.AiTaskTerminalCoordinator;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.service.PythonAsrClient;
import com.aetherflow.ai.workflow.executor.AsrNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 异步 AI worker 必须能解析真实 dispatcher 产出的任务类型。
 *
 * 受控集成测试：Python ASR 由受控替身返回，执行器注册表与 worker 使用真实实现，
 * 不代表真实语音服务或真实模型的验收。
 */
class AiTaskWhisperNodeTypeResolutionTest {

    @Test
    void dispatcherProducedWhisperTaskIsExecutedByTheAsrExecutor() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        PythonAsrClient pythonAsrClient = mock(PythonAsrClient.class);
        when(pythonAsrClient.transcribe(any(AiTranscriptionRequestDTO.class)))
                .thenReturn(new AiTranscriptionResponseDTO("2026", "1\n00:00:00,000 --> 00:00:01,000\n2026\n",
                        "transcription.srt", 1.0D));
        // 真实注册表 + 真实 ASR 执行器：注册表只登记 ASR，WHISPER 必须能被解析到它。
        DefaultAiNodeExecutorRegistry executorRegistry =
                new DefaultAiNodeExecutorRegistry(List.of(new AsrNodeExecutor(pythonAsrClient)));
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null);
        stubInsertAndAuthoritativeRead(aiJobMapper);
        when(fileRegistrationService.registerArtifacts(any(TaskMessageDTO.class), any(AiJobLease.class), any()))
                .thenReturn(ArtifactRegistrationResult.empty());
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper, new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry, cacheService, fileRegistrationService,
                terminalCoordinator, sentinelAiGuard, new ObjectMapper());
        TaskMessageDTO message = dispatchedWhisperTask();

        service.process(message);

        ArgumentCaptor<AiTranscriptionRequestDTO> request = ArgumentCaptor.forClass(AiTranscriptionRequestDTO.class);
        verify(pythonAsrClient).transcribe(request.capture());
        assertThat(request.getValue().getFileUrl()).isEqualTo("http://minio/aetherflow/audio.mp3");
        verify(terminalCoordinator).recordSuccess(any(), any(), eq(message), any());
        verify(terminalCoordinator, org.mockito.Mockito.never()).recordFailure(any(), any(), any(), any());
    }

    @Test
    void unknownNodeTypeIsStillRejectedWithTheOriginalType() {
        AiJobMapper aiJobMapper = mock(AiJobMapper.class);
        AiTaskCacheService cacheService = mock(AiTaskCacheService.class);
        AiFileRegistrationService fileRegistrationService = mock(AiFileRegistrationService.class);
        AiTaskTerminalCoordinator terminalCoordinator = mock(AiTaskTerminalCoordinator.class);
        SentinelAiGuard sentinelAiGuard = mock(SentinelAiGuard.class);
        doAnswer(invocation -> {
            invocation.getArgument(1, Runnable.class).run();
            return null;
        }).when(sentinelAiGuard).run(eq("ai-task-process"), any(Runnable.class));
        DefaultAiNodeExecutorRegistry executorRegistry =
                new DefaultAiNodeExecutorRegistry(List.of(new AsrNodeExecutor(mock(PythonAsrClient.class))));
        when(aiJobMapper.selectByIdempotencyKey(eq(7L), anyString())).thenReturn(null);
        stubInsertAndAuthoritativeRead(aiJobMapper);
        AiTaskProcessingServiceImpl service = new AiTaskProcessingServiceImpl(
                aiJobMapper, new AiJobLeaseService(aiJobMapper),
                new AiJobLeaseHeartbeat(new AiJobLeaseService(aiJobMapper)),
                executorRegistry, cacheService, fileRegistrationService,
                terminalCoordinator, sentinelAiGuard, new ObjectMapper());
        TaskMessageDTO message = dispatchedWhisperTask();
        message.setNodeType("VIDEO_TRANSCRIBE");

        Throwable thrown = catchThrowable(() -> service.process(message));

        assertThat(thrown).isInstanceOf(BusinessException.class)
                .hasMessageContaining("unsupported ai node type: VIDEO_TRANSCRIBE");
    }

    @Test
    void registryResolvesWhisperAliasWithExistingCaseAndWhitespaceNormalization() {
        DefaultAiNodeExecutorRegistry registry = new DefaultAiNodeExecutorRegistry(
                List.of(new AsrNodeExecutor(mock(PythonAsrClient.class))));

        assertThat(registry.getRequired("WHISPER")).isNotNull();
        assertThat(registry.getRequired("whisper")).isSameAs(registry.getRequired("ASR"));
        assertThat(registry.getRequired("  Whisper  ")).isSameAs(registry.getRequired("ASR"));
        assertThat(registry.getRequired("ASR")).isNotNull();
        assertThat(registry.availableNodeTypes()).containsExactly("ASR");
    }

    /** 真实 AsyncAiTaskDispatcher 产出的任务消息形状：类型保持 WHISPER 不被改写。 */
    private static TaskMessageDTO dispatchedWhisperTask() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setTaskId(59L);
        message.setWorkflowInstanceId(101L);
        message.setUserId(7L);
        message.setTraceId("trace-101");
        message.setNodeId("node-whisper");
        message.setNodeType("WHISPER");
        message.setIdempotencyKey("workflow-ai:101:trace-101:node-whisper:WHISPER:root");
        message.setPayload(Map.of("fileUrl", "http://minio/aetherflow/audio.mp3", "language", "auto", "prompt", ""));
        message.setEnqueue(true);
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
