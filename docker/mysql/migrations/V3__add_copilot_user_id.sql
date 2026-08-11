SET @col_exists = (SELECT COUNT(1)
                   FROM information_schema.columns
                   WHERE table_schema = DATABASE()
                     AND table_name = 'af_copilot_conversation'
                     AND column_name = 'user_id');
SET @sql = IF(@col_exists = 0,
              'ALTER TABLE af_copilot_conversation ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0 AFTER id',
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1)
                   FROM information_schema.statistics
                   WHERE table_schema = DATABASE()
                     AND table_name = 'af_copilot_conversation'
                     AND index_name = 'idx_af_copilot_conversation_user');
SET @sql = IF(@idx_exists = 0,
              'CREATE INDEX idx_af_copilot_conversation_user ON af_copilot_conversation (user_id)',
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
