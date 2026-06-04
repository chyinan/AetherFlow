SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_ai_job'
      AND column_name = 'idempotency_key'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_ai_job ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER task_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_ai_job'
      AND index_name = 'uk_af_ai_job_idempotency'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE af_ai_job ADD UNIQUE KEY uk_af_ai_job_idempotency (idempotency_key)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
