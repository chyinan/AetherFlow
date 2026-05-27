package com.aetherflow.gateway.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.gateway.config.GatewaySecurityProperties;
import com.aetherflow.gateway.config.GatewaySentinelProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class GatewayStatusController {

    private final RouteDefinitionLocator routeDefinitionLocator;
    private final GatewaySecurityProperties securityProperties;
    private final GatewaySentinelProperties sentinelProperties;

    @Value("${spring.application.name:gateway-service}")
    private String applicationName;

    @GetMapping("/gateway/status")
    public Mono<Result<Map<String, Object>>> status() {
        return routeDefinitionLocator.getRouteDefinitions()
                .map(RouteDefinition::getId)
                .collectList()
                .map(routeIds -> {
                    Map<String, Object> status = new LinkedHashMap<>();
                    status.put("service", applicationName);
                    status.put("status", "UP");
                    status.put("time", OffsetDateTime.now());
                    status.put("authEnabled", securityProperties.isAuthEnabled());
                    status.put("sentinelEnabled", sentinelProperties.isEnabled());
                    status.put("routeCount", routeIds.size());
                    status.put("routes", routeIds);
                    return Result.success(status);
                });
    }
}
