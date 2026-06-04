SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_notification_record'
      AND column_name = 'event_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_notification_record ADD COLUMN event_id VARCHAR(128) NULL AFTER user_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_notification_record'
      AND index_name = 'uk_af_notification_event_id'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE af_notification_record ADD UNIQUE KEY uk_af_notification_event_id (event_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
