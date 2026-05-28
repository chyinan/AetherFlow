package com.aetherflow.task.guard;

import com.aetherflow.common.core.ResultCode;
import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.monitor.QueueBusyStatus;
import com.aetherflow.task.monitor.QueueHealthSnapshot;
import com.aetherflow.task.monitor.QueueMonitorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class QueueBackpressureGuard {

    private final QueueMonitorService queueMonitorService;
    private final AiDispatchSentinelGuard sentinelGuard;
    private final TaskProperties properties;

    public void assertTaskCreationAllowed(TaskMessageDTO taskMessage) {
        if (!properties.getQueueProtection().isEnabled()) {
            sentinelGuard.checkTaskCreation();
            return;
        }

        QueueHealthSnapshot snapshot = queueMonitorService.currentSnapshot();
        if (snapshot.getStatus() == QueueBusyStatus.UNKNOWN) {
            snapshot = queueMonitorService.refreshNow();
        }
        if (snapshot.isBusy()) {
            long rejected = queueMonitorService.incrementRejectedTask();
            log.warn("task creation rejected by queue backpressure, workflowInstanceId={}, nodeId={}, status={}, totalMessages={}, unackedMessages={}, rejectedCount={}, reason={}",
                    taskMessage.getWorkflowInstanceId(),
                    taskMessage.getNodeId(),
                    snapshot.getStatus(),
                    snapshot.getTotalMessages(),
                    snapshot.getUnackedMessages(),
                    rejected,
                    snapshot.getReason());
            throw new BusinessException(ResultCode.SERVICE_UNAVAILABLE, "系统繁忙，请稍后重试");
        }

        sentinelGuard.checkTaskCreation();
    }
}
