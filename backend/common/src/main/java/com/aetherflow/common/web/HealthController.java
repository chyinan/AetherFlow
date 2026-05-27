package com.aetherflow.common.web;

import com.aetherflow.common.core.Result;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    @Value("${spring.application.name:unknown-service}")
    private String applicationName;

    @GetMapping("/health")
    public Result<Map<String, Object>> health() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("service", applicationName);
        status.put("status", "UP");
        status.put("time", OffsetDateTime.now());
        return Result.success(status);
    }
}

