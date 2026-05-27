package com.aetherflow.gateway.config;

import com.aetherflow.common.core.Result;
import com.aetherflow.common.core.ResultCode;
import com.aetherflow.gateway.support.ClientIpResolver;
import com.aetherflow.gateway.support.GatewayTrace;
import com.alibaba.csp.sentinel.adapter.gateway.common.SentinelGatewayConstants;
import com.alibaba.csp.sentinel.adapter.gateway.common.api.ApiDefinition;
import com.alibaba.csp.sentinel.adapter.gateway.common.api.ApiPathPredicateItem;
import com.alibaba.csp.sentinel.adapter.gateway.common.api.ApiPredicateItem;
import com.alibaba.csp.sentinel.adapter.gateway.common.api.GatewayApiDefinitionManager;
import com.alibaba.csp.sentinel.adapter.gateway.common.rule.GatewayFlowRule;
import com.alibaba.csp.sentinel.adapter.gateway.common.rule.GatewayParamFlowItem;
import com.alibaba.csp.sentinel.adapter.gateway.common.rule.GatewayRuleManager;
import com.alibaba.csp.sentinel.adapter.gateway.sc.callback.BlockRequestHandler;
import com.alibaba.csp.sentinel.adapter.gateway.sc.callback.GatewayCallbackManager;
import com.alibaba.csp.sentinel.slots.block.degrade.DegradeRule;
import com.alibaba.csp.sentinel.slots.block.degrade.DegradeRuleManager;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.reactive.function.server.ServerResponse;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Loads gateway flow-control rules and wires Sentinel callbacks to AetherFlow's
 * Result response format.
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class SentinelGatewayConfig {

    private final GatewaySentinelProperties properties;

    @PostConstruct
    public void init() {
        if (!properties.isEnabled()) {
            log.info("sentinel gateway integration disabled");
            return;
        }
        initBlockHandler();
        initApiGroups();
        initFlowRules();
        initDegradeRules();
    }

    @Bean
    public BlockRequestHandler sentinelBlockRequestHandler() {
        return this::handleBlockedRequest;
    }

    private void initBlockHandler() {
        GatewayCallbackManager.setRequestOriginParser(ClientIpResolver::resolve);
        GatewayCallbackManager.setBlockHandler(this::handleBlockedRequest);
    }

    private Mono<ServerResponse> handleBlockedRequest(ServerWebExchange exchange, Throwable throwable) {
        Result<Void> result = Result.<Void>fail(ResultCode.TOO_MANY_REQUESTS, "gateway flow control")
                .withRequestContext(GatewayTrace.resolve(exchange), exchange.getRequest().getURI().getPath());
        return ServerResponse.status(HttpStatus.TOO_MANY_REQUESTS)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(result);
    }

    private void initApiGroups() {
        Set<ApiDefinition> apiDefinitions = properties.getApiGroups().stream()
                .filter(group -> StringUtils.hasText(group.getName()) && !group.getPatterns().isEmpty())
                .map(this::toApiDefinition)
                .collect(Collectors.toCollection(HashSet::new));
        if (!apiDefinitions.isEmpty()) {
            GatewayApiDefinitionManager.loadApiDefinitions(apiDefinitions);
        }
        log.info("loaded sentinel gateway apiGroups={}", apiDefinitions.size());
    }

    private ApiDefinition toApiDefinition(GatewaySentinelProperties.ApiGroup group) {
        Set<ApiPredicateItem> predicateItems = group.getPatterns().stream()
                .filter(StringUtils::hasText)
                .map(pattern -> new ApiPathPredicateItem()
                        .setPattern(pattern)
                        .setMatchStrategy(matchStrategy(group.getMatchStrategy())))
                .collect(Collectors.toCollection(HashSet::new));
        return new ApiDefinition(group.getName()).setPredicateItems(predicateItems);
    }

    private void initFlowRules() {
        Set<GatewayFlowRule> rules = new HashSet<>();
        properties.getRouteRules().stream()
                .filter(rule -> StringUtils.hasText(rule.getResource()))
                .map(this::toRouteRule)
                .forEach(rules::add);
        properties.getIpRules().stream()
                .filter(rule -> StringUtils.hasText(rule.getResource()))
                .map(this::toIpRule)
                .forEach(rules::add);

        if (!rules.isEmpty()) {
            GatewayRuleManager.loadRules(rules);
        }
        log.info("loaded sentinel gateway flowRules={}", rules.size());
    }

    private void initDegradeRules() {
        List<DegradeRule> rules = properties.getDegradeRules().stream()
                .filter(rule -> StringUtils.hasText(rule.getResource()))
                .map(this::toDegradeRule)
                .toList();
        if (!rules.isEmpty()) {
            DegradeRuleManager.loadRules(rules);
        }
        log.info("loaded sentinel gateway degradeRules={}", rules.size());
    }

    private GatewayFlowRule toRouteRule(GatewaySentinelProperties.FlowRule rule) {
        return new GatewayFlowRule(rule.getResource())
                .setResourceMode(rule.getResourceMode())
                .setGrade(rule.getGrade())
                .setControlBehavior(rule.getControlBehavior())
                .setCount(rule.getCount())
                .setIntervalSec(rule.getIntervalSec())
                .setBurst(rule.getBurst())
                .setMaxQueueingTimeoutMs(rule.getMaxQueueingTimeoutMs());
    }

    private GatewayFlowRule toIpRule(GatewaySentinelProperties.IpRule rule) {
        return new GatewayFlowRule(rule.getResource())
                .setResourceMode(rule.getResourceMode())
                .setCount(rule.getCount())
                .setIntervalSec(rule.getIntervalSec())
                .setParamItem(new GatewayParamFlowItem()
                        .setParseStrategy(SentinelGatewayConstants.PARAM_PARSE_STRATEGY_CLIENT_IP));
    }

    private int matchStrategy(String strategy) {
        if ("exact".equalsIgnoreCase(strategy)) {
            return SentinelGatewayConstants.URL_MATCH_STRATEGY_EXACT;
        }
        if ("regex".equalsIgnoreCase(strategy)) {
            return SentinelGatewayConstants.URL_MATCH_STRATEGY_REGEX;
        }
        return SentinelGatewayConstants.URL_MATCH_STRATEGY_PREFIX;
    }

    private DegradeRule toDegradeRule(GatewaySentinelProperties.CircuitBreakerRule rule) {
        return new DegradeRule(rule.getResource())
                .setGrade(rule.getGrade())
                .setCount(rule.getCount())
                .setTimeWindow(rule.getTimeWindow())
                .setMinRequestAmount(rule.getMinRequestAmount())
                .setStatIntervalMs(rule.getStatIntervalMs())
                .setSlowRatioThreshold(rule.getSlowRatioThreshold());
    }
}
