package com.aetherflow.workflow.subworkflow;

import com.aetherflow.common.core.Result;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/workflows")
@RequiredArgsConstructor
public class SubworkflowController {
    private final WorkflowVersionService versions;
    private final SubworkflowService subworkflows;

    @GetMapping("/definitions/{definitionId}/versions")
    @Operation(summary = "List immutable workflow versions")
    public Result<List<VersionSummary>> versions(@PathVariable long definitionId) {
        return Result.success(versions.list(definitionId).stream()
                .map(version -> new VersionSummary(version.getDefinitionId(), version.getVersion(), version.getCreatedAt())).toList());
    }

    @GetMapping("/instances/{instanceId}/children")
    @Operation(summary = "List subworkflow call records")
    public Result<List<SubworkflowService.ChildRunView>> children(@PathVariable Long instanceId) {
        return Result.success(subworkflows.list(instanceId));
    }

    public record VersionSummary(Long definitionId, Integer version, LocalDateTime createdAt) { }
}
