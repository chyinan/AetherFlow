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
public class EnvVariablesController {

    @GetMapping("/env-variables")
    public Result<List<Map<String, Object>>> listEnvironmentVariables() {
        return Result.success(List.of(
                environmentVariable("JWT_SECRET", "Gateway"),
                environmentVariable("REDIS_PASSWORD", "Realtime"),
                environmentVariable("OPENAI_API_KEY", "AI Runtime"),
                environmentVariable("MINIO_SECRET_KEY", "Storage")
        ));
    }

    private Map<String, Object> environmentVariable(String key, String scope) {
        boolean configured = System.getenv(key) != null && !System.getenv(key).isBlank();
        return Map.of(
                "key", key,
                "scope", scope,
                "valuePreview", configured ? "••••••••" : "Not configured",
                "status", configured ? "configured" : "missing",
                "updatedAt", "runtime"
        );
    }
}
