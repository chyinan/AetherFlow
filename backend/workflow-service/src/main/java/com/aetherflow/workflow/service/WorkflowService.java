package com.aetherflow.workflow.service;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;

import java.util.List;

public interface WorkflowService {

    WorkflowDefinition createDefinition(WorkflowDefinitionDTO request);

    List<WorkflowDefinition> listDefinitions();

    WorkflowDefinition getDefinition(Long definitionId);

    WorkflowDefinition updateDefinition(Long definitionId, WorkflowDefinitionDTO request);

    void deleteDefinition(Long definitionId);

    WorkflowInstance startInstance(Long definitionId, StartWorkflowRequest request);
}

