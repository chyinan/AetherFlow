package com.aetherflow.ai.task;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class AiJobLeaseMigrationTest {

    @Test
    void flywayMigrationAddsFencedLeaseColumnsAndDueIndex() throws Exception {
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V3__add_ai_job_lease.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql)
                    .contains("lease_token VARCHAR(64)")
                    .contains("lease_expires_at DATETIME")
                    .contains("last_heartbeat_at DATETIME")
                    .contains("attempt_count INT NOT NULL DEFAULT 0")
                    .contains("idx_af_ai_job_lease_due (status, lease_expires_at)");
        }
    }

    @Test
    void dockerMigrationAddsTenantScopeForArtifactAuthority() throws Exception {
        java.nio.file.Path root = java.nio.file.Path.of("").toAbsolutePath();
        if (!java.nio.file.Files.exists(root.resolve("docker/mysql/migrations/V14__add_ai_job_user_scope.sql"))) {
            root = root.getParent().getParent();
        }
        String sql = java.nio.file.Files.readString(root.resolve("docker/mysql/migrations/V14__add_ai_job_user_scope.sql"));
        assertThat(sql).contains("ADD COLUMN user_id BIGINT").contains("idx_af_ai_job_user");
    }
}
