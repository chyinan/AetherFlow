package com.aetherflow.task.guard;

import com.aetherflow.common.dto.TaskMessageDTO;
import com.aetherflow.common.exception.BusinessException;
import com.aetherflow.task.config.TaskProperties;
import com.aetherflow.task.monitor.QueueBusyStatus;
import com.aetherflow.task.monitor.QueueHealthSnapshot;
import com.aetherflow.task.monitor.QueueMonitorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class QueueBackpressureGuardTest {

    private QueueMonitorService queueMonitorService;
    private AiDispatchSentinelGuard sentinelGuard;
    private QueueBackpressureGuard guard;

    @BeforeEach
    void setUp() {
        queueMonitorService = mock(QueueMonitorService.class);
        sentinelGuard = mock(AiDispatchSentinelGuard.class);
        guard = new QueueBackpressureGuard(queueMonitorService, sentinelGuard, new TaskProperties());
    }

    @Test
    void rejectsTaskCreationWhenQueueIsBusy() {
        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setStatus(QueueBusyStatus.BUSY);
        snapshot.setBusy(true);
        snapshot.setTotalMessages(1500);
        snapshot.setUnackedMessages(100);
        snapshot.setReason("queue backpressure active");
        when(queueMonitorService.currentSnapshot()).thenReturn(snapshot);
        when(queueMonitorService.incrementRejectedTask()).thenReturn(1L);

        assertThatThrownBy(() -> guard.assertTaskCreationAllowed(taskMessage()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("系统繁忙");

        verify(queueMonitorService).incrementRejectedTask();
        verifyNoInteractions(sentinelGuard);
    }

    @Test
    void allowsTaskCreationWhenQueueIsNormalAndSentinelPasses() {
        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setStatus(QueueBusyStatus.NORMAL);
        snapshot.setBusy(false);
        when(queueMonitorService.currentSnapshot()).thenReturn(snapshot);

        guard.assertTaskCreationAllowed(taskMessage());

        verify(sentinelGuard).checkTaskCreation();
    }

    private TaskMessageDTO taskMessage() {
        TaskMessageDTO message = new TaskMessageDTO();
        message.setWorkflowInstanceId(1L);
        message.setNodeId("node-ai");
        message.setNodeType("AI_TRANSCRIPTION");
        return message;
    }
}
