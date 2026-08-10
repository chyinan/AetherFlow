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
public class ApiExtensionsController {

    @GetMapping("/api-extensions")
    public Result<List<Map<String, Object>>> listApiExtensions() {
        return Result.success(List.of(
                Map.of("id", "gateway", "name", "Gateway REST API", "description", "Authenticated REST entry point",
                        "endpoint", "/api", "status", "connected", "scope", "Gateway"),
                Map.of("id", "runtime-sse", "name", "Runtime SSE", "description", "Workflow runtime event stream",
                        "endpoint", "/sse/workflow/runtime/stream/{workflowId}", "status", "configured", "scope", "Realtime"),
                Map.of("id", "notify-webhook", "name", "Notification webhook", "description", "Reserved outbound webhook contract",
                        "endpoint", "/api/notify/webhook", "status", "disabled", "scope", "Webhook")
        ));
    }
}
