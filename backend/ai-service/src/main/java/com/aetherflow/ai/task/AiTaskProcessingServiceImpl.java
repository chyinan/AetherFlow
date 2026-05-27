package com.aetherflow.ai.task;

import com.aetherflow.ai.cache.AiTaskCacheService;
import com.aetherflow.ai.callback.AiTaskCallbackService;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.file.AiFileRegistrationService;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.sentinel.SentinelAiGuard;
import com.aetherflow.ai.workflow.AiNodeExecutionContext;
import com.aetherflow.ai.workflow.AiNodeResult;
import com.aetherflow.ai.workflow.executor.AiNodeExecutor;
import com.aetherflow.ai.workflow.executor.DefaultAiNodeExecutorRegistry;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiTaskProcessingServiceImpl implements AiTaskProcessingService {

    private final AiJobMapper aiJobMapper;
    private final DefaultAiNodeExecutorRegistry executorRegistry;
    private final AiTaskCacheService cacheService;
    private final AiFileRegistrationService fileRegistrationService;
    private final AiTaskCallbackService callbackService;
    private final SentinelAiGuard sentinelAiGuard;
    private final ObjectMapper objectMapper;

    @Override
    public void process(TaskMessageDTO taskMessage) {
        sentinelAiGuard.run("ai-task-process", () -> doProcess(taskMessage));
    }

    private void doProcess(TaskMessageDTO taskMessage) {
        validateTask(taskMessage);
        Map<String, Object> payload = taskMessage.getPayload() == null ? Map.of() : new LinkedHashMap<>(taskMessage.getPayload());
        AiJob job = createRunningJob(taskMessage, payload);
        cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.RUNNING);
        log.info("AI task started taskId={}, workflowInstanceId={}, nodeId={}, nodeType={}",
                taskMessage.getTaskId(), taskMessage.getWorkflowInstanceId(), taskMessage.getNodeId(), taskMessage.getNodeType());
        try {
            AiNodeExecutor executor = executorRegistry.getRequired(taskMessage.getNodeType());
            AiNodeResult result = executor.execute(new AiNodeExecutionContext(taskMessage, payload));
            completeJob(job, result);
            cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.SUCCEEDED);
            cacheService.cacheResult(taskMessage.getTaskId(), result.output());
            fileRegistrationService.registerArtifacts(result.artifacts());
            callbackService.notifySuccess(taskMessage, result);
            log.info("AI task succeeded taskId={}, jobId={}", taskMessage.getTaskId(), job.getId());
        } catch (RuntimeException exception) {
            failJob(job, exception);
            cacheService.markStatus(taskMessage.getTaskId(), AiTaskStatus.FAILED);
            cacheService.cacheError(taskMessage.getTaskId(), exception.getMessage());
            callbackService.notifyFailure(taskMessage, exception.getMessage());
            log.error("AI task failed taskId={}, jobId={}", taskMessage.getTaskId(), job.getId(), exception);
            throw exception;
        }
    }

    private void validateTask(TaskMessageDTO taskMessage) {
        if (taskMessage == null || taskMessage.getTaskId() == null || taskMessage.getNodeType() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid ai task message");
        }
    }

    private AiJob createRunningJob(TaskMessageDTO taskMessage, Map<String, Object> payload) {
        AiJob job = new AiJob();
        job.setTaskId(taskMessage.getTaskId());
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(payload));
        job.setStatus(AiTaskStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.insert(job);
        return job;
    }

    private void completeJob(AiJob job, AiNodeResult result) {
        job.setOutputJson(writeJson(result.output()));
        job.setStatus(AiTaskStatus.SUCCEEDED);
        job.setCompletedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);
    }

    private void failJob(AiJob job, RuntimeException exception) {
        job.setOutputJson(writeJson(Map.of("error", exception.getMessage())));
        job.setStatus(AiTaskStatus.FAILED);
        job.setCompletedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job json serialization failed");
        }
    }
}
