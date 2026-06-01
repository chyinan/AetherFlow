CREATE TABLE IF NOT EXISTS af_knowledge_dataset (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    status VARCHAR(32) NOT NULL,
    document_count INT NOT NULL DEFAULT 0,
    processing_document_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    failed_chunk_count INT NOT NULL DEFAULT 0,
    hit_rate INT NOT NULL DEFAULT 0,
    embedding_model VARCHAR(128) NOT NULL,
    retrieval_mode VARCHAR(128) NOT NULL,
    owner_user_id BIGINT,
    owner VARCHAR(128),
    tags_json LONGTEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_dataset_owner (owner_user_id),
    KEY idx_af_knowledge_dataset_status (status),
    KEY idx_af_knowledge_dataset_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_knowledge_document (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    file_id VARCHAR(128),
    mode VARCHAR(64) NOT NULL,
    char_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    recall_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    uploaded_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_document_dataset (dataset_id),
    KEY idx_af_knowledge_document_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_knowledge_chunk (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    source VARCHAR(255),
    preview LONGTEXT,
    tokens INT NOT NULL DEFAULT 0,
    score DOUBLE NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    chunk_index INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_chunk_dataset (dataset_id),
    KEY idx_af_knowledge_chunk_document (document_id),
    KEY idx_af_knowledge_chunk_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
