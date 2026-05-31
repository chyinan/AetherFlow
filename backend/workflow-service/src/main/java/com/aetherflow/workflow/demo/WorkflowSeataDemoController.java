package com.aetherflow.workflow.demo;

import com.aetherflow.common.core.Result;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Workflow Demo Observability", description = "Demo-only endpoints for Sentinel and Seata dashboards.")
@RestController
@RequestMapping("/workflow/demo")
@RequiredArgsConstructor
public class WorkflowSeataDemoController {

    private final WorkflowSeataDemoService service;

    @Operation(summary = "Create a short Seata global transaction for dashboard demonstration.")
    @PostMapping("/seata-transaction")
    public Result<WorkflowSeataDemoResponse> createSeataTransaction(
            @RequestParam(defaultValue = "10") int holdSeconds,
            @RequestParam(defaultValue = "false") boolean rollback) {
        try {
            return Result.success(service.createDemoTransaction(holdSeconds, rollback));
        } catch (WorkflowSeataRollbackDemoException exception) {
            return Result.success(exception.getResponse());
        }
    }
}
