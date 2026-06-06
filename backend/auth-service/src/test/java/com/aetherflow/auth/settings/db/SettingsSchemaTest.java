package com.aetherflow.auth.settings.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class SettingsSchemaTest {

    @Test
    void moduleAndDockerSqlCreateSettingsTables() throws IOException {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/auth-service/src/main/resources/db/settings-admin.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        assertThat(moduleSql)
                .contains("CREATE TABLE IF NOT EXISTS af_settings_profile")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_member")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_billing")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_audit_event")
                .contains("telegram_enabled TINYINT(1) NOT NULL DEFAULT 0")
                .contains("telegram_bot_token VARCHAR(255)")
                .contains("KEY idx_af_settings_member_status")
                .contains("KEY idx_af_settings_audit_event_occurred");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_settings_profile")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_member")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_billing")
                .contains("CREATE TABLE IF NOT EXISTS af_settings_audit_event")
                .contains("telegram_enabled TINYINT(1) NOT NULL DEFAULT 0")
                .contains("telegram_chat_id VARCHAR(128)")
                .contains("monthly_budget VARCHAR(32) NOT NULL");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
