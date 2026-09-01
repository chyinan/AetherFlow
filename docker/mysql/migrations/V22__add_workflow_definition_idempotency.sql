SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_definition'
       AND COLUMN_NAME = 'idempotency_key'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_workflow_definition ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER owner_user_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
    SELECT COUNT(*)
      FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_definition'
       AND INDEX_NAME = 'uk_af_workflow_definition_owner_idempotency'
);
SET @sql = IF(
    @index_exists = 0,
    'CREATE UNIQUE INDEX uk_af_workflow_definition_owner_idempotency ON af_workflow_definition (owner_user_id, idempotency_key)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
