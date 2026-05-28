package com.aetherflow.ai.config;

import com.alibaba.csp.sentinel.slots.block.RuleConstant;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRule;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRuleManager;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Configuration
@RequiredArgsConstructor
public class AiSentinelConfig {

    private final AiTaskProperties properties;

    @PostConstruct
    public void loadAiFlowRules() {
        if (!properties.isSentinelEnabled()) {
            log.info("AI Sentinel rules are disabled");
            return;
        }
        List<FlowRule> rules = new ArrayList<>();
        rules.add(flowRule("ai-task-process", properties.getTaskQps()));
        rules.add(flowRule("ai-http-transcription", properties.getHttpQps()));
        rules.add(flowRule("ai-provider-router", properties.getProviderQps()));
        rules.add(flowRule("ai-provider-openai", properties.getProviderQps()));
        rules.add(flowRule("ai-provider-ollama", properties.getProviderQps()));
        rules.add(flowRule("ai-provider-health-openai", properties.getHttpQps()));
        rules.add(flowRule("ai-provider-health-ollama", properties.getHttpQps()));
        rules.add(flowRule("ai-provider-status", properties.getHttpQps()));
        rules.add(flowRule("ai-provider-policy", properties.getHttpQps()));
        rules.add(flowRule("ai-provider-metrics", properties.getHttpQps()));
        FlowRuleManager.loadRules(rules);
        log.info("Loaded AI Sentinel flow rules count={}", rules.size());
    }

    private FlowRule flowRule(String resource, double count) {
        FlowRule rule = new FlowRule(resource);
        rule.setGrade(RuleConstant.FLOW_GRADE_QPS);
        rule.setCount(count);
        return rule;
    }
}
