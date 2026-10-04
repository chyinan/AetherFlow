SET @column_exists = (
    SELECT COUNT(*)
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'af_copilot_message'
       AND COLUMN_NAME = 'plan_json'
);
SET @sql = IF(
    @column_exists = 0,
    'ALTER TABLE af_copilot_message ADD COLUMN plan_json LONGTEXT NULL AFTER content',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
