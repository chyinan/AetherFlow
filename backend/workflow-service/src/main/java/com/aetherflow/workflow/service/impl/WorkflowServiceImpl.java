package com.aetherflow.workflow.service.impl;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.common.dto.WorkflowNodeDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.workflow.client.TaskClient;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.mapper.WorkflowDefinitionMapper;
import com.aetherflow.workflow.mapper.WorkflowInstanceMapper;
import com.aetherflow.workflow.service.WorkflowService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class WorkflowServiceImpl implements WorkflowService {

    private static final String STATUS_ENABLED = "ENABLED";
    private static final String STATUS_RUNNING = "RUNNING";

    private final WorkflowDefinitionMapper definitionMapper;
    private final WorkflowInstanceMapper instanceMapper;
    private final TaskClient taskClient;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowDefinition createDefinition(WorkflowDefinitionDTO request) {
        WorkflowDefinition definition = new WorkflowDefinition();
        definition.setName(request.getName());
        definition.setDescription(request.getDescription());
        definition.setDefinitionJson(writeJson(request));
        definition.setVersion(1);
        definition.setStatus(STATUS_ENABLED);
        definition.setCreatedAt(LocalDateTime.now());
        definition.setUpdatedAt(LocalDateTime.now());
        definitionMapper.insert(definition);
        return definition;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public WorkflowInstance startInstance(Long definitionId, StartWorkflowRequest request) {
        WorkflowDefinition definition = definitionMapper.selectById(definitionId);
        if (definition == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "workflow definition not found");
        }

        WorkflowDefinitionDTO definitionDTO = readDefinition(definition.getDefinitionJson());
        WorkflowNodeDTO firstNode = definitionDTO.getNodes().get(0);

        WorkflowInstance instance = new WorkflowInstance();
        instance.setDefinitionId(definitionId);
        instance.setUserId(request.getUserId());
        instance.setInputJson(writeJson(request.getInput()));
        instance.setStatus(STATUS_RUNNING);
        instance.setCurrentNodeId(firstNode.getNodeId());
        instance.setStartedAt(LocalDateTime.now());
        instance.setUpdatedAt(LocalDateTime.now());
        instanceMapper.insert(instance);

        TaskMessageDTO taskMessage = new TaskMessageDTO();
        taskMessage.setWorkflowInstanceId(instance.getId());
        taskMessage.setNodeId(firstNode.getNodeId());
        taskMessage.setNodeType(firstNode.getNodeType());
        taskMessage.setPayload(request.getInput());
        taskMessage.setRetryCount(0);
        taskMessage.setCreatedAt(java.time.OffsetDateTime.now());
        Result<Long> dispatchResult = taskClient.dispatch(taskMessage);
        if (dispatchResult == null || !dispatchResult.isSuccess()) {
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "task-service dispatch failed");
        }

        return instance;
    }

    private WorkflowDefinitionDTO readDefinition(String definitionJson) {
        try {
            return objectMapper.readValue(definitionJson, WorkflowDefinitionDTO.class);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.INTERNAL_ERROR, "workflow definition json invalid");
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new BusinessException(ResultCode.BAD_REQUEST, "json serialization failed");
        }
    }
}

