package com.aetherflow.auth.oauth.db;

import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class OAuthAccountSchemaTest {

    @Test
    void oauthAccountSchemaIsIncludedInModuleAndDockerInitSql() throws Exception {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/auth-service/src/main/resources/db/oauth-account.sql"));
        String googleMigrationSql = Files.readString(root.resolve(
                "backend/auth-service/src/main/resources/db/V20260603_01__google_oauth_account.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        assertThat(moduleSql)
                .contains("CREATE TABLE IF NOT EXISTS af_oauth_account")
                .contains("UNIQUE KEY uk_af_oauth_provider_user");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_oauth_account")
                .contains("UNIQUE KEY uk_af_oauth_provider_user");
        assertThat(googleMigrationSql)
                .contains("CREATE TABLE IF NOT EXISTS af_oauth_account")
                .contains("provider_user_id")
                .contains("provider_email")
                .contains("avatar_url");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
