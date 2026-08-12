DELIMITER //

CREATE PROCEDURE af_add_knowledge_column_if_missing_v7(
    IN table_name_value VARCHAR(64),
    IN column_name_value VARCHAR(64),
    IN ddl_value TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND COLUMN_NAME = column_name_value
    ) THEN
        SET @af_v7_sql = ddl_value;
        PREPARE af_v7_stmt FROM @af_v7_sql;
        EXECUTE af_v7_stmt;
        DEALLOCATE PREPARE af_v7_stmt;
    END IF;
END//

CREATE PROCEDURE af_add_knowledge_index_if_missing_v7(
    IN table_name_value VARCHAR(64),
    IN index_name_value VARCHAR(64),
    IN ddl_value TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND INDEX_NAME = index_name_value
    ) THEN
        SET @af_v7_sql = ddl_value;
        PREPARE af_v7_stmt FROM @af_v7_sql;
        EXECUTE af_v7_stmt;
        DEALLOCATE PREPARE af_v7_stmt;
    END IF;
END//

CALL af_add_knowledge_column_if_missing_v7('af_knowledge_dataset', 'owner_user_id',
    'ALTER TABLE af_knowledge_dataset ADD COLUMN owner_user_id BIGINT AFTER retrieval_mode')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_dataset', 'idempotency_key',
    'ALTER TABLE af_knowledge_dataset ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER owner_user_id')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_chunk', 'vector_json',
    'ALTER TABLE af_knowledge_chunk ADD COLUMN vector_json LONGTEXT AFTER preview')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_chunk', 'parent_chunk_id',
    'ALTER TABLE af_knowledge_chunk ADD COLUMN parent_chunk_id BIGINT AFTER document_id')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_chunk', 'chunk_type',
    'ALTER TABLE af_knowledge_chunk ADD COLUMN chunk_type VARCHAR(32) NOT NULL DEFAULT ''general'' AFTER parent_chunk_id')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_chunk', 'metadata_json',
    'ALTER TABLE af_knowledge_chunk ADD COLUMN metadata_json LONGTEXT AFTER preview')//
CALL af_add_knowledge_column_if_missing_v7('af_knowledge_document', 'idempotency_key',
    'ALTER TABLE af_knowledge_document ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER dataset_id')//

SET @af_v7_demo_user_id = (
    SELECT id
    FROM af_user
    WHERE username = 'aether.operator'
    ORDER BY id
    LIMIT 1
)//
SET @af_v7_demo_user_id = COALESCE(@af_v7_demo_user_id, (SELECT id FROM af_user ORDER BY id LIMIT 1), 1)//
UPDATE af_knowledge_dataset
SET owner_user_id = @af_v7_demo_user_id,
    owner = COALESCE(NULLIF(owner, ''), 'aether.operator')
WHERE owner_user_id IS NULL//

CALL af_add_knowledge_index_if_missing_v7('af_knowledge_dataset', 'idx_af_knowledge_dataset_owner',
    'ALTER TABLE af_knowledge_dataset ADD INDEX idx_af_knowledge_dataset_owner (owner_user_id)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_dataset', 'idx_af_knowledge_dataset_status',
    'ALTER TABLE af_knowledge_dataset ADD INDEX idx_af_knowledge_dataset_status (status)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_dataset', 'idx_af_knowledge_dataset_updated',
    'ALTER TABLE af_knowledge_dataset ADD INDEX idx_af_knowledge_dataset_updated (updated_at)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_dataset', 'uk_af_knowledge_dataset_owner_idempotency',
    'ALTER TABLE af_knowledge_dataset ADD UNIQUE INDEX uk_af_knowledge_dataset_owner_idempotency (owner_user_id, idempotency_key)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_document', 'uk_af_knowledge_document_dataset_idempotency',
    'ALTER TABLE af_knowledge_document ADD UNIQUE INDEX uk_af_knowledge_document_dataset_idempotency (dataset_id, idempotency_key)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_document', 'idx_af_knowledge_document_dataset',
    'ALTER TABLE af_knowledge_document ADD INDEX idx_af_knowledge_document_dataset (dataset_id)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_document', 'idx_af_knowledge_document_status',
    'ALTER TABLE af_knowledge_document ADD INDEX idx_af_knowledge_document_status (status)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_chunk', 'idx_af_knowledge_chunk_parent',
    'ALTER TABLE af_knowledge_chunk ADD INDEX idx_af_knowledge_chunk_parent (parent_chunk_id)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_chunk', 'idx_af_knowledge_chunk_dataset',
    'ALTER TABLE af_knowledge_chunk ADD INDEX idx_af_knowledge_chunk_dataset (dataset_id)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_chunk', 'idx_af_knowledge_chunk_document',
    'ALTER TABLE af_knowledge_chunk ADD INDEX idx_af_knowledge_chunk_document (document_id)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_chunk', 'idx_af_knowledge_chunk_status',
    'ALTER TABLE af_knowledge_chunk ADD INDEX idx_af_knowledge_chunk_status (status)')//
CALL af_add_knowledge_index_if_missing_v7('af_knowledge_chunk', 'ft_af_knowledge_chunk_search',
    'ALTER TABLE af_knowledge_chunk ADD FULLTEXT INDEX ft_af_knowledge_chunk_search (source, preview)')//

DROP PROCEDURE af_add_knowledge_column_if_missing_v7//
DROP PROCEDURE af_add_knowledge_index_if_missing_v7//

DELIMITER ;
