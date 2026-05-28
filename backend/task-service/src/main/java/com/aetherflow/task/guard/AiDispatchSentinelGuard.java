package com.aetherflow.task.guard;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.alibaba.csp.sentinel.Entry;
import com.alibaba.csp.sentinel.SphU;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.alibaba.csp.sentinel.slots.block.RuleConstant;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRule;
import com.alibaba.csp.sentinel.slots.block.flow.FlowRuleManager;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class AiDispatchSentinelGuard {

    private final TaskProperties properties;

    @PostConstruct
    public void initRules() {
        TaskProperties.SentinelProtection sentinel = properties.getSentinelProtection();
        if (!sentinel.isEnabled()) {
            return;
        }
        List<FlowRule> rules = new ArrayList<>(FlowRuleManager.getRules());
        rules.removeIf(rule -> sentinel.getDispatchResource().equals(rule.getResource())
                || sentinel.getConsumerDispatchResource().equals(rule.getResource()));
        rules.add(flowRule(sentinel.getDispatchResource(), sentinel.getDispatchQps()));
        rules.add(flowRule(sentinel.getConsumerDispatchResource(), sentinel.getConsumerDispatchQps()));
        FlowRuleManager.loadRules(rules);
        log.info("sentinel task-service AI dispatch rules loaded, dispatchQps={}, consumerDispatchQps={}",
                sentinel.getDispatchQps(), sentinel.getConsumerDispatchQps());
    }

    public void checkTaskCreation() {
        check(properties.getSentinelProtection().getDispatchResource(), "系统繁忙，请稍后重试");
    }

    public void checkConsumerDispatch() {
        check(properties.getSentinelProtection().getConsumerDispatchResource(), "ai dispatch rate limited");
    }

    private void check(String resource, String message) {
        if (!properties.getSentinelProtection().isEnabled()) {
            return;
        }
        Entry entry = null;
        try {
            entry = SphU.entry(resource);
        } catch (BlockException exception) {
            log.warn("sentinel blocked task-service resource, resource={}", resource, exception);
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, message);
        } finally {
            if (entry != null) {
                entry.exit();
            }
        }
    }

    private FlowRule flowRule(String resource, double qps) {
        FlowRule rule = new FlowRule();
        rule.setResource(resource);
        rule.setGrade(RuleConstant.FLOW_GRADE_QPS);
        rule.setCount(qps);
        return rule;
    }
}
