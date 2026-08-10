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
public class IntegrationsController {

    @GetMapping("/integrations")
    public Result<List<Map<String, Object>>> listIntegrations() {
        return Result.success(List.of(
                Map.of("id", "slack", "name", "Slack", "description", "Not configured",
                        "status", "disabled", "endpoint", ""),
                Map.of("id", "microsoft-teams", "name", "Microsoft Teams", "description", "Not configured",
                        "status", "disabled", "endpoint", ""),
                Map.of("id", "discord", "name", "Discord", "description", "Not configured",
                        "status", "disabled", "endpoint", "")
        ));
    }
}
