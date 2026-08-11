SET @col_exists = (SELECT COUNT(1)
                   FROM information_schema.columns
                   WHERE table_schema = DATABASE()
                     AND table_name = 'af_user'
                     AND column_name = 'role');
SET @sql = IF(@col_exists = 0,
              'ALTER TABLE af_user ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT ''USER'' AFTER status',
              'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
