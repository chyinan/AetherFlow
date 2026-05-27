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

        assertThat(moduleSql).contains("CREATE TABLE IF NOT EXISTS af_file_info");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_file_info")
                .contains("file_size BIGINT")
                .contains("file_url VARCHAR(1024) NOT NULL")
                .contains("KEY idx_af_file_info_status (status)")
                .doesNotContain("af_file_object");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
