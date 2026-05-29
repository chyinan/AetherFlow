package com.aetherflow.workflow.embedding.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetrics;
import com.aetherflow.workflow.embedding.metrics.EmbeddingMetricsSnapshot;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Workflow Embedding Metrics", description = "Workflow embedding node execution metrics APIs.")
@RestController
@RequestMapping("/workflow/embedding")
@RequiredArgsConstructor
public class EmbeddingMetricsController {

    private final EmbeddingMetrics metrics;

    @Operation(summary = "Get workflow embedding metrics",
            description = "Returns embedding count, average duration, vector count and current model for workflow RAG preprocessing nodes.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Embedding metrics returned.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = EmbeddingMetricsSnapshot.class),
                            examples = @ExampleObject(value = """
                                    {
                                      "code": 0,
                                      "message": "success",
                                      "data": {
                                        "embeddingCount": 128,
                                        "failCount": 3,
                                        "averageDurationMs": 420,
                                        "vectorCount": 1024,
                                        "currentModel": "nomic-embed-text"
                                      }
                                    }
                                    """))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/metrics")
    public Result<EmbeddingMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }
}
