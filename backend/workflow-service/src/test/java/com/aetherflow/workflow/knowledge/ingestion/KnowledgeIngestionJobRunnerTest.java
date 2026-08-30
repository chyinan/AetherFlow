package com.aetherflow.workflow.knowledge.ingestion;

import com.aetherflow.workflow.knowledge.service.impl.KnowledgeServiceImpl;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// pattern: Imperative Shell
class KnowledgeIngestionJobRunnerTest {

    @Test
    void claimsDueJobsAndDispatchesThemToWorkerExecutor() {
        KnowledgeIngestionJobMapper mapper = mock(KnowledgeIngestionJobMapper.class);
        KnowledgeServiceImpl service = mock(KnowledgeServiceImpl.class);
        KnowledgeIngestionProperties properties = new KnowledgeIngestionProperties();
        properties.setScanLimit(5);
        Executor executor = Runnable::run;
        KnowledgeIngestionJobEntity job = new KnowledgeIngestionJobEntity();
        job.setId(10L);
        when(mapper.selectList(any(Wrapper.class))).thenReturn(List.of(job));
        when(mapper.claim(eq(10L), any(LocalDateTime.class))).thenReturn(1);

        KnowledgeIngestionJobRunner runner = new KnowledgeIngestionJobRunner(mapper, properties, service, executor);

        assertThat(runner.dispatchDueJobs()).isEqualTo(1);
        verify(service).processQueuedDocument(10L);
    }
}
