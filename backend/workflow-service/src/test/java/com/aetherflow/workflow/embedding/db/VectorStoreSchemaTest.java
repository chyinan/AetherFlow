package com.aetherflow.workflow.embedding.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class VectorStoreSchemaTest {

    @Test
    void moduleMigrationAndDockerSqlCreatePersistentVectorStoreConfig() throws IOException {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/workflow-service/src/main/resources/db/vector-store-config.sql"));
        String migrationSql = Files.readString(root.resolve("docker/mysql/migrations/V2__add_vector_store_config.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        for (String sql : new String[]{moduleSql, migrationSql, dockerInitSql}) {
            assertThat(sql)
                    .contains("CREATE TABLE IF NOT EXISTS af_vector_store_config")
                    .contains("api_key VARCHAR(4096)")
                    .contains("collection VARCHAR(255) NOT NULL")
                    .contains("updated_at DATETIME NOT NULL");
        }
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
