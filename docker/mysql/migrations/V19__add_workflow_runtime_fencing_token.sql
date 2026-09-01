SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_runtime_snapshot'
       AND COLUMN_NAME = 'fencing_token'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_workflow_runtime_snapshot ADD COLUMN fencing_token VARCHAR(128) NULL AFTER runtime_state',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
