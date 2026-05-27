package com.aetherflow.ai.service.impl;

import com.aetherflow.ai.client.FileClient;
import com.aetherflow.ai.entity.AiJob;
import com.aetherflow.ai.mapper.AiJobMapper;
import com.aetherflow.ai.service.AiInferenceService;
import com.aetherflow.common.core.RabbitMqNames;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.AiTranscriptionRequestDTO;
import com.aetherflow.common.dto.AiTranscriptionResponseDTO;
import com.aetherflow.common.dto.CreateFileMetadataRequestDTO;
import com.aetherflow.common.dto.NotifyMessageDTO;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiInferenceServiceImpl implements AiInferenceService {

    private final AiJobMapper aiJobMapper;
    private final FileClient fileClient;
    private final RabbitTemplate rabbitTemplate;
    private final RestClient pythonAiRestClient;
    private final ObjectMapper objectMapper;

    @Override
    public AiTranscriptionResponseDTO transcribe(AiTranscriptionRequestDTO request) {
        AiTranscriptionResponseDTO response = pythonAiRestClient.post()
                .uri("/v1/transcriptions")
                .body(request)
                .retrieve()
                .body(AiTranscriptionResponseDTO.class);
        if (response == null) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "python ai service returned empty response");
        }
        return response;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void processTask(TaskMessageDTO taskMessage) {
        AiJob job = new AiJob();
        job.setTaskId(taskMessage.getTaskId());
        job.setWorkflowInstanceId(taskMessage.getWorkflowInstanceId());
        job.setJobType(taskMessage.getNodeType());
        job.setInputJson(writeJson(taskMessage.getPayload()));
        job.setStatus("RUNNING");
        job.setStartedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.insert(job);

        AiTranscriptionRequestDTO request = new AiTranscriptionRequestDTO();
        request.setFileUrl(String.valueOf(taskMessage.getPayload().get("fileUrl")));
        request.setLanguage((String) taskMessage.getPayload().getOrDefault("language", "auto"));
        request.setPrompt((String) taskMessage.getPayload().getOrDefault("prompt", ""));

        AiTranscriptionResponseDTO response = transcribe(request);
        job.setOutputJson(writeJson(response));
        job.setStatus("SUCCEEDED");
        job.setCompletedAt(LocalDateTime.now());
        job.setUpdatedAt(LocalDateTime.now());
        aiJobMapper.updateById(job);

        if (response.getSrtObjectKey() != null && !response.getSrtObjectKey().isBlank()) {
            CreateFileMetadataRequestDTO metadataRequest = new CreateFileMetadataRequestDTO();
            metadataRequest.setBucket("aetherflow");
            metadataRequest.setObjectKey(response.getSrtObjectKey());
            metadataRequest.setOriginalName(response.getSrtObjectKey());
            metadataRequest.setContentType("text/plain");
            fileClient.createMetadata(metadataRequest);
        }

        NotifyMessageDTO notifyMessage = new NotifyMessageDTO();
        notifyMessage.setEventType("AI_TASK_SUCCEEDED");
        notifyMessage.setChannel("WORKFLOW");
        notifyMessage.setPayload(Map.of(
                "taskId", taskMessage.getTaskId(),
                "workflowInstanceId", taskMessage.getWorkflowInstanceId(),
                "nodeId", taskMessage.getNodeId(),
                "text", response.getText()
        ));
        notifyMessage.setOccurredAt(OffsetDateTime.now());
        rabbitTemplate.convertAndSend(RabbitMqNames.NOTIFY_EXCHANGE, RabbitMqNames.NOTIFY_ROUTING_KEY, notifyMessage);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "ai job json serialization failed");
        }
    }
}

