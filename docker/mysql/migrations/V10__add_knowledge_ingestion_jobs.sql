DELIMITER //

CREATE PROCEDURE af_add_knowledge_ingestion_v10()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'af_knowledge_document'
          AND COLUMN_NAME = 'error_message'
    ) THEN
        ALTER TABLE af_knowledge_document ADD COLUMN error_message VARCHAR(1000) NULL AFTER status;
    END IF;
END//

CALL af_add_knowledge_ingestion_v10()//
DROP PROCEDURE af_add_knowledge_ingestion_v10//

DELIMITER ;

CREATE TABLE IF NOT EXISTS af_knowledge_ingestion_job (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    payload_json LONGTEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME,
    last_error VARCHAR(1000),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_knowledge_ingestion_document (document_id),
    KEY idx_af_knowledge_ingestion_due (status, next_attempt_at),
    KEY idx_af_knowledge_ingestion_dataset (dataset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
