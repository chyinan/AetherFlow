package com.aetherflow.auth.settings.controller;

// pattern: Imperative Shell

import com.aetherflow.common.core.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/settings")
public class DataSourcesController {

    @GetMapping("/data-sources")
    public Result<List<Map<String, Object>>> listDataSources() {
        return Result.success(List.of(
                Map.of("id", "file-service", "name", "AetherFlow File Service", "maintainer", "AetherFlow",
                        "description", "Managed uploads, artifacts and downloads", "installCount", "built-in",
                        "status", "connected", "tags", List.of("file", "minio", "artifact")),
                Map.of("id", "knowledge-service", "name", "AetherFlow Knowledge", "maintainer", "AetherFlow",
                        "description", "Datasets, documents, chunks and retrieval", "installCount", "built-in",
                        "status", "connected", "tags", List.of("knowledge", "retrieval")),
                Map.of("id", "url-ingestion", "name", "URL ingestion", "maintainer", "AetherFlow",
                        "description", "Fetch and normalize public web content", "installCount", "built-in",
                        "status", "available", "tags", List.of("url", "web"))
        ));
    }
}
