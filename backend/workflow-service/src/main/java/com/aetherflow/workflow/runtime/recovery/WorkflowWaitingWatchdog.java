package com.aetherflow.workflow.runtime.recovery;

import com.aetherflow.workflow.runtime.config.WorkflowRuntimeProperties;
import com.aetherflow.workflow.runtime.persistence.RuntimeSnapshotRepository;
import com.aetherflow.workflow.runtime.persistence.WorkflowRuntimeSnapshot;
import com.aetherflow.workflow.runtime.api.RuntimeState;
import com.aetherflow.workflow.runtime.async.WorkflowAsyncCompletionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * 防止外部 AI 回调永久丢失导致运行实例卡在 WAITING。
 * HUMAN 节点仍由人工审批流程控制，不会被本看门狗自动失败。
 */
@Slf4j
@Component
@RequiredArgsConstructor
// pattern: Imperative Shell
public class WorkflowWaitingWatchdog {

    private final RuntimeSnapshotRepository snapshotRepository;
    private final WorkflowAsyncCompletionService completionService;
    private final WorkflowRuntimeProperties properties;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.runtime.recovery.waiting-watchdog-interval:60000}")
    public int expireStaleWaitingWorkflows() {
        WorkflowRuntimeProperties.Recovery recovery = properties.getRecovery();
        if (!recovery.isEnabled() || !recovery.isWaitingWatchdogEnabled()) {
            return 0;
        }
        Duration timeout = recovery.getWaitingTimeout();
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            return 0;
        }
        Instant before = Instant.now().minus(timeout);
        int expired = 0;
        for (WorkflowRuntimeSnapshot snapshot : snapshotRepository.findWaiting(recovery.getScanLimit(), before)) {
            if (snapshot == null || snapshot.runtimeState() != RuntimeState.WAITING) {
                continue;
            }
            for (String nodeId : snapshot.currentNodeIds()) {
                if (isHumanNode(snapshot, nodeId)) {
                    continue;
                }
                try {
                    completionService.completeFailure(Long.valueOf(snapshot.workflowId()), nodeId,
                            "external AI completion timed out");
                    expired++;
                } catch (RuntimeException exception) {
                    log.warn("waiting workflow watchdog could not expire workflowId={}, nodeId={}, reason={}",
                            snapshot.workflowId(), nodeId, exception.getMessage());
                }
            }
        }
        return expired;
    }

    private boolean isHumanNode(WorkflowRuntimeSnapshot snapshot, String nodeId) {
        if (snapshot.definition().getNodes() == null) {
            return false;
        }
        return snapshot.definition().getNodes().stream()
                .filter(node -> nodeId.equals(node.getNodeId()))
                .map(node -> node.getNodeType())
                .anyMatch(type -> "HUMAN".equalsIgnoreCase(type));
    }
}
