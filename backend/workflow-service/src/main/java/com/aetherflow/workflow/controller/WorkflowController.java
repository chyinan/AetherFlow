package com.aetherflow.workflow.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.dto.WorkflowDefinitionDTO;
import com.aetherflow.workflow.entity.WorkflowDefinition;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.service.WorkflowService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;

    @PostMapping("/definitions")
    public Result<WorkflowDefinition> createDefinition(@Valid @RequestBody WorkflowDefinitionDTO request) {
        return Result.success(workflowService.createDefinition(request));
    }

    @PostMapping("/definitions/{definitionId}/instances")
    public Result<WorkflowInstance> startInstance(@PathVariable Long definitionId,
                                                  @RequestBody StartWorkflowRequest request) {
        return Result.success(workflowService.startInstance(definitionId, request));
    }
}

