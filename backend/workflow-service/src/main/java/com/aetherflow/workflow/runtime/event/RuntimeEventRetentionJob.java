package com.aetherflow.workflow.runtime.event;

import com.aetherflow.workflow.mapper.WorkflowRuntimeEventMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
// pattern: Imperative Shell
public class RuntimeEventRetentionJob {

    private final WorkflowRuntimeEventMapper mapper;

    @Value("${aetherflow.workflow.runtime-event-retention:30d}")
    private Duration retention = Duration.ofDays(30);

    @Value("${aetherflow.workflow.runtime-event-retention-batch-size:1000}")
    private int batchSize = 1000;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.runtime-event-retention-fixed-delay:3600000}")
    public int purgeExpiredEvents() {
        LocalDateTime before = LocalDateTime.now().minus(retention);
        return mapper.deleteBefore(before, Math.max(1, Math.min(batchSize, 10_000)));
    }
}
