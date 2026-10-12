package com.aetherflow.workflow.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.entity.WorkflowInstance;
import com.aetherflow.workflow.service.impl.WorkflowNodeRerunService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/workflow-instances/{id}/nodes/{nodeId}/rerun")
@RequiredArgsConstructor
public class WorkflowNodeRerunController {
    private final WorkflowNodeRerunService service;

    @GetMapping("/preview")
    public Result<WorkflowNodeRerunService.Preview> preview(@PathVariable Long id, @PathVariable String nodeId) {
        return Result.success(service.preview(id, nodeId));
    }

    @PostMapping
    public Result<WorkflowInstance> rerun(@PathVariable Long id, @PathVariable String nodeId,
                                          @Valid @RequestBody WorkflowNodeRerunRequest request) {
        return Result.success(service.rerun(id, nodeId, request.expectedRevision()));
    }
}
