package com.aetherflow.ai.outbox;

import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

// pattern: Imperative Shell
class AiTaskOutboxMigrationTest {

    @Test
    void flywayMigrationCreatesDurableDeduplicatedOutbox() throws Exception {
        try (InputStream input = getClass().getClassLoader().getResourceAsStream(
                "db/migration/V2__create_ai_task_event_outbox.sql")) {
            assertThat(input).isNotNull();
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertThat(sql).contains("CREATE TABLE IF NOT EXISTS af_ai_task_event_outbox");
            assertThat(sql).contains("UNIQUE KEY uk_af_ai_task_outbox_event (event_id)");
            assertThat(sql).contains("KEY idx_af_ai_task_outbox_due (status, next_attempt_at)");
        }
    }
}
