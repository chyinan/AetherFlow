package com.aetherflow.workflow.knowledge.ingestion;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

class KnowledgeIngestionMigrationTest {

    @Test
    void migrationCreatesDurableIngestionJobAndDocumentErrorColumn() throws IOException {
        Path root = Path.of("").toAbsolutePath();
        if (!Files.exists(root.resolve("docker/mysql/migrations/V10__add_knowledge_ingestion_jobs.sql"))) {
            root = root.getParent().getParent();
        }
        String sql = Files.readString(root.resolve("docker/mysql/migrations/V10__add_knowledge_ingestion_jobs.sql"));

        assertThat(sql).contains("af_knowledge_ingestion_job")
                .contains("document_id BIGINT NOT NULL")
                .contains("uk_af_knowledge_ingestion_document")
                .contains("error_message VARCHAR(1000)");
    }
}
