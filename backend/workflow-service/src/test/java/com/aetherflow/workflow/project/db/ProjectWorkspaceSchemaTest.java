package com.aetherflow.workflow.project.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class ProjectWorkspaceSchemaTest {

    @Test
    void moduleAndDockerSqlCreateProjectWorkspaceTables() throws IOException {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/workflow-service/src/main/resources/db/project-workspace.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        assertThat(moduleSql)
                .contains("CREATE TABLE IF NOT EXISTS af_workspace")
                .contains("CREATE TABLE IF NOT EXISTS af_project")
                .contains("UNIQUE KEY uk_af_workspace_slug")
                .contains("KEY idx_af_workspace_owner")
                .contains("KEY idx_af_project_owner")
                .contains("KEY idx_af_project_workspace")
                .contains("KEY idx_af_project_status");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_workspace")
                .contains("CREATE TABLE IF NOT EXISTS af_project")
                .contains("workspace_id BIGINT")
                .contains("KEY idx_af_workspace_owner")
                .contains("KEY idx_af_project_owner");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
