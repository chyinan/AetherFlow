package com.aetherflow.workflow.service;

import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.controller.StartWorkflowRequest;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;

public interface WorkflowService {

    WorkflowDefinition createDefinition(WorkflowDefinitionDTO request);

    WorkflowInstance startInstance(Long definitionId, StartWorkflowRequest request);
}

