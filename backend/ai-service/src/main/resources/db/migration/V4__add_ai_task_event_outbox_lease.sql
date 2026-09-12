SET @col_exists = (SELECT COUNT(1)
                     FROM information_schema.columns
                    WHERE table_schema = DATABASE()
                      AND table_name = 'af_ai_task_event_outbox'
                      AND column_name = 'lease_token');
SET @sql = IF(@col_exists = 0,
              'ALTER TABLE af_ai_task_event_outbox ADD COLUMN lease_token VARCHAR(64) NULL AFTER status',
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1)
                     FROM information_schema.statistics
                    WHERE table_schema = DATABASE()
                      AND table_name = 'af_ai_task_event_outbox'
                      AND index_name = 'idx_af_ai_task_outbox_processing');
SET @sql = IF(@idx_exists = 0,
              'ALTER TABLE af_ai_task_event_outbox ADD INDEX idx_af_ai_task_outbox_processing (status, updated_at)',
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
