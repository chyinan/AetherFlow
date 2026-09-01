SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_knowledge_ingestion_job'
       AND COLUMN_NAME = 'lease_token'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_knowledge_ingestion_job ADD COLUMN lease_token VARCHAR(64) NULL AFTER status',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
    SELECT COUNT(*)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_knowledge_ingestion_job'
       AND INDEX_NAME = 'idx_af_knowledge_ingestion_job_lease'
);
SET @sql = IF(
    @index_exists = 0,
    'CREATE INDEX idx_af_knowledge_ingestion_job_lease ON af_knowledge_ingestion_job (status, lease_token, updated_at)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
