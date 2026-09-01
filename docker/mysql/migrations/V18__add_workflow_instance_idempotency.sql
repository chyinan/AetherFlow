SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_instance'
       AND COLUMN_NAME = 'idempotency_key'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_workflow_instance ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER user_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
    SELECT COUNT(*)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_instance'
       AND INDEX_NAME = 'uk_af_workflow_instance_user_idempotency'
);
SET @sql = IF(
    @index_exists = 0,
    'CREATE UNIQUE INDEX uk_af_workflow_instance_user_idempotency ON af_workflow_instance (user_id, idempotency_key)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
