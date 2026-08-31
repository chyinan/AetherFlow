package com.aetherflow.file.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class FileServiceSchemaTest {

    @Test
    void dockerMysqlInitCreatesCurrentFileInfoTable() throws IOException {
        String dockerInitSql = Files.readString(repositoryRoot()
                .resolve("docker/mysql/init/01-aetherflow.sql"));
        String moduleSql = Files.readString(repositoryRoot()
                .resolve("backend/file-service/src/main/resources/db/file-service.sql"));
        String migration = Files.readString(repositoryRoot()
                .resolve("docker/mysql/migrations/V11__harden_generated_file_artifacts.sql"));
        String stateMachineMigration = Files.readString(repositoryRoot()
                .resolve("docker/mysql/migrations/V13__add_generated_artifact_state_machine.sql"));
        String aiScopeMigration = Files.readString(repositoryRoot()
                .resolve("docker/mysql/migrations/V14__add_ai_job_user_scope.sql"));

        assertThat(moduleSql).contains("CREATE TABLE IF NOT EXISTS af_file_info");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_file_info")
                .contains("file_size BIGINT")
                .contains("file_url VARCHAR(1024) NOT NULL")
                .contains("idempotency_key VARCHAR(128)")
                .contains("UNIQUE KEY uk_af_file_info_user_idempotency (user_id, idempotency_key)")
                .contains("KEY idx_af_file_info_status (status)")
                .doesNotContain("af_file_object");
        assertThat(moduleSql)
                .contains("idempotency_key VARCHAR(128)")
                .contains("uk_af_file_info_user_idempotency");
        assertThat(migration)
                .contains("DROP INDEX uk_af_file_info_object")
                .contains("ADD UNIQUE INDEX uk_af_file_info_user_idempotency (user_id, idempotency_key)");
        assertThat(stateMachineMigration)
                .contains("artifact_batch_id VARCHAR(128)")
                .contains("producer_fence_token VARCHAR(64)")
                .contains("claim_token VARCHAR(64)")
                .contains("claim_expires_at DATETIME(6)")
                .contains("idx_af_file_info_artifact_batch");
        assertThat(aiScopeMigration).contains("ADD COLUMN user_id BIGINT");
        assertThat(aiScopeMigration).contains("ADD COLUMN user_id BIGINT").contains("idx_af_ai_job_user");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
