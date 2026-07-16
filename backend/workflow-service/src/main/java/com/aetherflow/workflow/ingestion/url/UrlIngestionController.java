package com.aetherflow.workflow.ingestion.url;

import com.aetherflow.common.core.Result;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchRequest;
import com.aetherflow.workflow.ingestion.url.UrlIngestionDtos.UrlFetchResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/ingestion/url")
@RequiredArgsConstructor
@Tag(name = "URL Ingestion", description = "Fetch public web pages and expose clean text for workflow nodes.")
public class UrlIngestionController {

    private final UrlIngestionService urlIngestionService;

    @GetMapping
    @Operation(summary = "Get URL ingestion capability status")
    public Result<Map<String, Object>> status() {
        return Result.success(Map.of(
                "status", "configured",
                "endpoint", "/ingestion/url/fetch"
        ));
    }

    @PostMapping("/fetch")
    @Operation(summary = "Fetch URL text")
    public Result<UrlFetchResponse> fetch(@Valid @RequestBody UrlFetchRequest request) {
        return Result.success(urlIngestionService.fetch(request));
    }
}
