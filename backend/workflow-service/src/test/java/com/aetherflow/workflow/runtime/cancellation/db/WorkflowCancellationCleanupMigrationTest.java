package com.aetherflow.workflow.runtime.cancellation.db;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class WorkflowCancellationCleanupMigrationTest {
    @Test
    void createsLeasedIdempotentCleanupQueueAndBackfillsCancelledRuns() throws Exception {
        Path current = Path.of("").toAbsolutePath();
        Path root = Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))
                ? current : current.getParent().getParent();
        String migration = Files.readString(root.resolve("docker/mysql/migrations/V31__create_workflow_cancellation_cleanup.sql"));
        String dockerInit = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));
        String reliabilitySql = Files.readString(root.resolve("backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql"));

        assertThat(migration)
                .contains("CREATE TABLE IF NOT EXISTS af_workflow_cancellation_cleanup",
                        "UNIQUE KEY uk_af_workflow_cancellation_cleanup_instance (workflow_instance_id)",
                        "KEY idx_af_workflow_cancellation_cleanup_due (status, next_attempt_at, updated_at)",
                        "lease_token VARCHAR(64)", "attempt_count INT NOT NULL DEFAULT 0",
                        "WHERE status = 'CANCELLED'");
        assertThat(dockerInit).contains("CREATE TABLE IF NOT EXISTS af_workflow_cancellation_cleanup");
        assertThat(reliabilitySql).contains("CREATE TABLE IF NOT EXISTS af_workflow_cancellation_cleanup",
                "INSERT IGNORE INTO af_workflow_cancellation_cleanup");
    }
}
