package com.aetherflow.gateway.config;

import com.alibaba.csp.sentinel.adapter.gateway.common.SentinelGatewayConstants;
import com.alibaba.csp.sentinel.slots.block.RuleConstant;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@Data
@ConfigurationProperties(prefix = "aetherflow.gateway.sentinel")
public class GatewaySentinelProperties {

    private boolean enabled = true;
    private List<ApiGroup> apiGroups = new ArrayList<>();
    private List<FlowRule> routeRules = new ArrayList<>();
    private List<IpRule> ipRules = new ArrayList<>();
    private List<CircuitBreakerRule> degradeRules = new ArrayList<>();

    @Data
    public static class ApiGroup {
        private String name;
        private List<String> patterns = new ArrayList<>();
        private String matchStrategy = "prefix";
    }

    @Data
    public static class FlowRule {
        private String resource;
        private int resourceMode = SentinelGatewayConstants.RESOURCE_MODE_ROUTE_ID;
        private int grade = RuleConstant.FLOW_GRADE_QPS;
        private int controlBehavior = RuleConstant.CONTROL_BEHAVIOR_DEFAULT;
        private double count = 100;
        private long intervalSec = 1;
        private int burst = 0;
        private int maxQueueingTimeoutMs = 0;
    }

    @Data
    public static class IpRule {
        private String resource;
        private int resourceMode = SentinelGatewayConstants.RESOURCE_MODE_ROUTE_ID;
        private double count = 30;
        private long intervalSec = 1;
    }

    @Data
    public static class CircuitBreakerRule {
        private String resource;
        private int grade = RuleConstant.DEGRADE_GRADE_EXCEPTION_RATIO;
        private double count = 0.5;
        private int timeWindow = 10;
        private int minRequestAmount = 20;
        private int statIntervalMs = 10000;
        private double slowRatioThreshold = 0.5;
    }
}
