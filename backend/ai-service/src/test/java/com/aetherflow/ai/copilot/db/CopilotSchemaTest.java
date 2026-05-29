package com.aetherflow.ai.copilot.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class CopilotSchemaTest {

    @Test
    void moduleAndDockerSqlCreateCopilotTables() throws IOException {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/ai-service/src/main/resources/db/copilot-chat.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        assertThat(moduleSql)
                .contains("CREATE TABLE IF NOT EXISTS af_copilot_conversation")
                .contains("CREATE TABLE IF NOT EXISTS af_copilot_message")
                .contains("KEY idx_af_copilot_conversation_updated")
                .contains("KEY idx_af_copilot_message_conversation");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_copilot_conversation")
                .contains("CREATE TABLE IF NOT EXISTS af_copilot_message")
                .contains("conversation_id BIGINT NOT NULL");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
