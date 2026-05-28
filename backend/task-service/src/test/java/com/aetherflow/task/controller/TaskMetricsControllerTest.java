package com.aetherflow.task.controller;

import com.aetherflow.common.core.Result;
import com.aetherflow.task.monitor.QueueBusyStatus;
import com.aetherflow.task.monitor.QueueHealthSnapshot;
import com.aetherflow.task.monitor.QueueMonitorService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TaskMetricsControllerTest {

    @Test
    void returnsCurrentQueueHealthSnapshot() {
        QueueMonitorService queueMonitorService = mock(QueueMonitorService.class);
        QueueHealthSnapshot snapshot = new QueueHealthSnapshot();
        snapshot.setStatus(QueueBusyStatus.NORMAL);
        snapshot.setTotalMessages(12);
        when(queueMonitorService.currentSnapshot()).thenReturn(snapshot);

        TaskMetricsController controller = new TaskMetricsController(queueMonitorService);
        Result<QueueHealthSnapshot> result = controller.metrics();

        assertThat(result.getData().getStatus()).isEqualTo(QueueBusyStatus.NORMAL);
        assertThat(result.getData().getTotalMessages()).isEqualTo(12);
    }
}
