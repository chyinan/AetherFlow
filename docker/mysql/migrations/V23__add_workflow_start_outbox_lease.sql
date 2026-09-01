SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_workflow_start_outbox'
       AND COLUMN_NAME = 'lease_token'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_workflow_start_outbox ADD COLUMN lease_token VARCHAR(64) NULL AFTER status',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
