package com.aetherflow.workflow.runtime.notification;

// pattern: Imperative Shell

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WorkflowTerminalNotificationRetentionJobTest {

    @Test
    void deletesPublishedRowsInBoundedBatches() {
        WorkflowTerminalNotificationOutboxMapper mapper = mock(WorkflowTerminalNotificationOutboxMapper.class);
        when(mapper.deletePublishedBefore(any(), eq(10_000))).thenReturn(10_000);
        WorkflowTerminalNotificationRetentionJob job = new WorkflowTerminalNotificationRetentionJob(mapper);
        ReflectionTestUtils.setField(job, "retention", Duration.ofDays(30));
        ReflectionTestUtils.setField(job, "batchSize", 50_000);

        job.purgePublished();

        verify(mapper).deletePublishedBefore(any(), eq(10_000));
    }
}
