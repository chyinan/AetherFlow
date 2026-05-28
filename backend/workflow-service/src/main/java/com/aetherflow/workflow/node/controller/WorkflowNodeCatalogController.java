package com.aetherflow.workflow.node.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogItem;
import com.aetherflow.workflow.node.catalog.WorkflowNodeCatalogService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Workflow Node Catalog", description = "Frontend public workflow node catalog and configuration schema APIs.")
@RestController
@RequestMapping("/workflow/node")
@RequiredArgsConstructor
public class WorkflowNodeCatalogController {

    private final WorkflowNodeCatalogService catalogService;

    @Operation(
            summary = "List workflow node catalog",
            description = "Returns node types, config schema, input variables, output variables and example configs for frontend workflow builder."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Workflow node catalog returned.",
                    content = @Content(array = @ArraySchema(schema = @Schema(implementation = WorkflowNodeCatalogItem.class)))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/catalog")
    public Result<List<WorkflowNodeCatalogItem>> catalog() {
        return Result.success(catalogService.catalog());
    }
}
