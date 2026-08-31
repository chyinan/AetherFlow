package com.aetherflow.file.service.impl;

// pattern: Imperative Shell

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class GeneratedArtifactRecoveryJob {

    private final FileInfoServiceImpl fileInfoService;

    @Scheduled(fixedDelayString = "${aetherflow.file.generated-artifact-recovery-interval-millis:60000}")
    public void recoverStaleArtifacts() {
        int recovered = fileInfoService.reconcileStaleGeneratedArtifacts();
        if (recovered > 0) {
            log.info("stale generated artifacts reconciled count={}", recovered);
        }
    }
}
