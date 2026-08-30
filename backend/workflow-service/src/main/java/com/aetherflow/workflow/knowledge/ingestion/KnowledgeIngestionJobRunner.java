package com.aetherflow.workflow.knowledge.ingestion;

import com.aetherflow.workflow.knowledge.service.KnowledgeService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Executor;

/** 扫描并认领持久摄取作业，服务重启后可继续未完成任务。 */
@Slf4j
@Component
@RequiredArgsConstructor
// pattern: Imperative Shell
public class KnowledgeIngestionJobRunner {

    private static final java.time.Duration STALE_PROCESSING_AFTER = java.time.Duration.ofMinutes(10);

    private final KnowledgeIngestionJobMapper jobMapper;
    private final KnowledgeIngestionProperties properties;
    private final KnowledgeService knowledgeService;
    @org.springframework.beans.factory.annotation.Qualifier("knowledgeIngestionTaskExecutor")
    private final Executor executor;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.knowledge.ingestion.poll-interval-millis:2000}")
    public int dispatchDueJobs() {
        if (!properties.isEnabled()) {
            return 0;
        }
        LocalDateTime now = LocalDateTime.now();
        jobMapper.requeueStale(now.minus(STALE_PROCESSING_AFTER), now);
        List<KnowledgeIngestionJobEntity> jobs = jobMapper.selectList(new LambdaQueryWrapper<KnowledgeIngestionJobEntity>()
                .eq(KnowledgeIngestionJobEntity::getStatus, KnowledgeIngestionJobEntity.PENDING)
                .and(wrapper -> wrapper.isNull(KnowledgeIngestionJobEntity::getNextAttemptAt)
                        .or()
                        .le(KnowledgeIngestionJobEntity::getNextAttemptAt, now))
                .orderByAsc(KnowledgeIngestionJobEntity::getId)
                .last("LIMIT " + Math.max(1, properties.getScanLimit())));
        int dispatched = 0;
        for (KnowledgeIngestionJobEntity job : jobs) {
            if (job == null || job.getId() == null || jobMapper.claim(job.getId(), now) != 1) {
                continue;
            }
            try {
                executor.execute(() -> knowledgeService.processQueuedDocument(job.getId()));
                dispatched++;
            } catch (RuntimeException exception) {
                jobMapper.release(job.getId(), LocalDateTime.now());
                log.warn("knowledge ingestion worker saturated, jobId={}, reason={}",
                        job.getId(), exception.getMessage());
            }
        }
        return dispatched;
    }
}
