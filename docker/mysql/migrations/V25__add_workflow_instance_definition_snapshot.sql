-- Freeze the exact validated definition used by a submitted workflow instance.
SET @definition_snapshot_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_instance'
       AND COLUMN_NAME = 'definition_json'
);
SET @definition_snapshot_sql = IF(
    @definition_snapshot_exists = 0,
    'ALTER TABLE af_workflow_instance ADD COLUMN definition_json JSON NULL AFTER input_json',
    'SELECT 1'
);
PREPARE definition_snapshot_stmt FROM @definition_snapshot_sql;
EXECUTE definition_snapshot_stmt;
DEALLOCATE PREPARE definition_snapshot_stmt;
