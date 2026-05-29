package com.aetherflow.workflow.ocr.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.ocr.metrics.OCRMetrics;
import com.aetherflow.workflow.ocr.metrics.OCRMetricsSnapshot;
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

@Tag(name = "Workflow OCR Metrics", description = "Workflow OCR node execution metrics APIs.")
@RestController
@RequestMapping("/workflow/ocr")
@RequiredArgsConstructor
public class OCRMetricsController {

    private final OCRMetrics metrics;

    @Operation(summary = "Get workflow OCR metrics",
            description = "Returns OCR execution count, failure count and average duration for the workflow OCR node.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "OCR metrics returned.",
                    content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                            schema = @Schema(implementation = OCRMetricsSnapshot.class),
                            examples = @ExampleObject(value = """
                                    {
                                      "code": 0,
                                      "message": "success",
                                      "data": {
                                        "ocrCount": 128,
                                        "failCount": 3,
                                        "averageDurationMs": 860
                                      }
                                    }
                                    """))),
            @ApiResponse(responseCode = "500", description = "Unexpected server error.")
    })
    @GetMapping("/metrics")
    public Result<OCRMetricsSnapshot> metrics() {
        return Result.success(metrics.snapshot());
    }
}
