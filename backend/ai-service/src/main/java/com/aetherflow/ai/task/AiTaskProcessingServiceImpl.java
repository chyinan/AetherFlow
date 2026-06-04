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
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
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
        String idempotencyKey = idempotencyKey(taskMessage);
        AiJob existingJob = findJob(idempotencyKey);
        if (existingJob != null && (AiTaskStatus.SUCCEEDED.equals(existingJob.getStatus())
                || AiTaskStatus.RUNNING.equals(existingJob.getStatus()))) {
            log.info("AI task duplicate ignored taskId={}, nodeId={}, status={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId(), existingJob.getStatus());
            return;
        }
        boolean firstAttempt = existingJob == null;
        AiJob job = firstAttempt
                ? createRunningJob(taskMessage, payload, idempotencyKey)
                : retryJob(existingJob, taskMessage, payload);
        if (job == null) {
            log.info("AI task duplicate ignored after idempotency race taskId={}, nodeId={}",
                    taskMessage.getTaskId(), taskMessage.getNodeId());
            return;
        }
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
            if (firstAttempt) {
                callbackService.notifyFailure(taskMessage, exception.getMessage());
            }
            log.error("AI task failed taskId={}, jobId={}", taskMessage.getTaskId(), job.getId(), exception);
            throw exception;
        }
    }

    private void validateTask(TaskMessageDTO taskMessage) {
        if (taskMessage == null || taskMessage.getTaskId() == null || taskMessage.getNodeType() == null) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "invalid ai task message");
        }
    }

    private AiJob findJob(String idempotencyKey) {
        return aiJobMapper.selectOne(new LambdaQueryWrapper<AiJob>()
                .eq(AiJob::getIdempotencyKey, idempotencyKey)
                .last("LIMIT 1"));
    }

    private AiJob createRunningJob(TaskMessageDTO taskMessage, Map<String, Object> payload, String idempotencyKey) {
        AiJob job = new AiJob();
        job.setTaskId(taskMessage.getTaskId());
        job.setIdempotencyKey(idempotencyKey);
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(payload));
        job.setStatus(AiTaskStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        try {
            aiJobMapper.insert(job);
        } catch (DuplicateKeyException exception) {
            return null;
        }
        return job;
    }

    private AiJob retryJob(AiJob job, TaskMessageDTO taskMessage, Map<String, Object> payload) {
        job.setTaskId(taskMessage.getTaskId());
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(payload));
        job.setOutputJson(null);
        job.setStatus(AiTaskStatus.RUNNING);
        job.setStartedAt(LocalDateTime.now());
        job.setCompletedAt(null);
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);
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

    private String idempotencyKey(TaskMessageDTO taskMessage) {
        String taskId = String.valueOf(taskMessage.getTaskId());
        String nodeId = taskMessage.getNodeId() == null || taskMessage.getNodeId().isBlank()
                ? ""
                : taskMessage.getNodeId().trim();
        return nodeId.isEmpty() ? taskId : taskId + ":" + nodeId;
    }
}
