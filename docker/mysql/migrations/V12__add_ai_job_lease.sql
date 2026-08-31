SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_ai_job' AND column_name = 'lease_token');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_ai_job ADD COLUMN lease_token VARCHAR(64) NULL AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_ai_job' AND column_name = 'lease_expires_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_ai_job ADD COLUMN lease_expires_at DATETIME(6) NULL AFTER lease_token', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_ai_job' AND column_name = 'last_heartbeat_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_ai_job ADD COLUMN last_heartbeat_at DATETIME(6) NULL AFTER lease_expires_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_ai_job' AND column_name = 'attempt_count');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_ai_job ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 AFTER last_heartbeat_at', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_ai_job' AND index_name = 'idx_af_ai_job_lease_due');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_ai_job ADD INDEX idx_af_ai_job_lease_due (status, lease_expires_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
