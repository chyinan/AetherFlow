package com.aetherflow.workflow.runtime.notification;

// pattern: Imperative Shell

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
public class WorkflowTerminalNotificationRetentionJob {

    private final WorkflowTerminalNotificationOutboxMapper mapper;

    @Value("${aetherflow.workflow.terminal-notification-retention:30d}")
    private Duration retention = Duration.ofDays(30);

    @Value("${aetherflow.workflow.terminal-notification-retention-batch-size:1000}")
    private int batchSize = 1000;

    @Scheduled(fixedDelayString = "${aetherflow.workflow.terminal-notification-retention-fixed-delay:3600000}")
    public void purgePublished() {
        int deleted = mapper.deletePublishedBefore(
                LocalDateTime.now().minus(retention), Math.max(1, Math.min(batchSize, 10_000)));
        if (deleted > 0) {
            log.info("workflow terminal notification outbox retention deleted count={}", deleted);
        }
    }
}
