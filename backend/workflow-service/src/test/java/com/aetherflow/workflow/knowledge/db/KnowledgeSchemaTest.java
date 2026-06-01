package com.aetherflow.workflow.knowledge.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeSchemaTest {

    @Test
    void moduleAndDockerSqlCreateKnowledgeTables() throws IOException {
        Path root = repositoryRoot();
        String moduleSql = Files.readString(root.resolve("backend/workflow-service/src/main/resources/db/knowledge-dataset.sql"));
        String dockerInitSql = Files.readString(root.resolve("docker/mysql/init/01-aetherflow.sql"));

        assertThat(moduleSql)
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_dataset")
                .contains("owner_user_id BIGINT")
                .contains("KEY idx_af_knowledge_dataset_owner")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_document")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_chunk")
                .contains("KEY idx_af_knowledge_document_dataset")
                .contains("KEY idx_af_knowledge_chunk_document");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_dataset")
                .contains("owner_user_id BIGINT")
                .contains("KEY idx_af_knowledge_dataset_owner")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_document")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_chunk")
                .contains("dataset_id BIGINT NOT NULL");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
