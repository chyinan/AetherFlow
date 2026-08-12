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
                .contains("idempotency_key VARCHAR(128)")
                .contains("uk_af_knowledge_dataset_owner_idempotency")
                .contains("KEY idx_af_knowledge_dataset_owner")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_document")
                .contains("idempotency_key VARCHAR(128)")
                .contains("uk_af_knowledge_document_dataset_idempotency")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_chunk")
                .contains("parent_chunk_id BIGINT")
                .contains("chunk_type VARCHAR(32)")
                .contains("metadata_json LONGTEXT")
                .contains("KEY idx_af_knowledge_document_dataset")
                .contains("KEY idx_af_knowledge_chunk_document");
        assertThat(dockerInitSql)
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_dataset")
                .contains("owner_user_id BIGINT")
                .contains("idempotency_key VARCHAR(128)")
                .contains("uk_af_knowledge_dataset_owner_idempotency")
                .contains("KEY idx_af_knowledge_dataset_owner")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_document")
                .contains("idempotency_key VARCHAR(128)")
                .contains("uk_af_knowledge_document_dataset_idempotency")
                .contains("CREATE TABLE IF NOT EXISTS af_knowledge_chunk")
                .contains("dataset_id BIGINT NOT NULL")
                .contains("parent_chunk_id BIGINT")
                .contains("chunk_type VARCHAR(32)")
                .contains("metadata_json LONGTEXT");

        String tenantSql = Files.readString(root.resolve("backend/workflow-service/src/main/resources/db/tenant-isolation.sql"));
        assertThat(tenantSql)
                .contains("af_knowledge_chunk", "parent_chunk_id", "chunk_type", "metadata_json", "idempotency_key")
                .contains("uk_af_knowledge_dataset_owner_idempotency", "uk_af_knowledge_document_dataset_idempotency");

        String migrationSql = Files.readString(root.resolve("docker/mysql/migrations/V7__add_knowledge_retrieval_and_idempotency.sql"));
        assertThat(migrationSql)
                .contains("af_knowledge_dataset", "owner_user_id", "vector_json", "parent_chunk_id",
                        "chunk_type", "metadata_json", "ft_af_knowledge_chunk_search")
                .contains("idempotency_key")
                .contains("uk_af_knowledge_dataset_owner_idempotency")
                .contains("uk_af_knowledge_document_dataset_idempotency")
                .contains("UPDATE af_knowledge_dataset");
    }

    private Path repositoryRoot() {
        Path current = Path.of("").toAbsolutePath();
        if (Files.exists(current.resolve("docker/mysql/init/01-aetherflow.sql"))) {
            return current;
        }
        return current.getParent().getParent();
    }
}
