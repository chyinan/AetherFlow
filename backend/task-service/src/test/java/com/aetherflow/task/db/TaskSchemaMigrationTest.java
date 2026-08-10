package com.aetherflow.task.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class TaskSchemaMigrationTest {

    @Test
    void existingMysqlVolumesReceiveTaskTraceIdMigrationBeforeTaskServiceStarts() throws IOException {
        Path root = repositoryRoot();
        String compose = Files.readString(root.resolve("docker-compose.yml"));
        String migration = Files.readString(root.resolve(
                "docker/mysql/migrations/V1__add_task_trace_id.sql"));
        String userMigration = Files.readString(root.resolve(
                "docker/mysql/migrations/V4__add_task_user_id.sql"));

        assertThat(compose)
                .contains("mysql-migrate:")
                .contains("baselineVersion=0")
                .contains("mysql-migrate:\n        condition: service_completed_successfully");
        assertThat(migration)
                .contains("information_schema.COLUMNS")
                .contains("ALTER TABLE af_task_record ADD COLUMN trace_id VARCHAR(64) NULL")
                .contains("UPDATE af_task_record")
                .contains("MODIFY COLUMN trace_id VARCHAR(64) NOT NULL");
        assertThat(userMigration)
                .contains("COLUMN_NAME = 'user_id'")
                .contains("ALTER TABLE af_task_record ADD COLUMN user_id")
                .contains("idx_af_task_record_user");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker-compose.yml"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
