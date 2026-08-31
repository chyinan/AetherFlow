SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'ai_job_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN ai_job_id BIGINT NULL AFTER idempotency_key', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'task_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN task_id BIGINT NULL AFTER ai_job_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'artifact_batch_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN artifact_batch_id VARCHAR(128) NULL AFTER task_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'artifact_ordinal');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN artifact_ordinal INT NULL AFTER artifact_batch_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'producer_fence_token');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN producer_fence_token VARCHAR(64) NULL AFTER artifact_ordinal', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'claim_token');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN claim_token VARCHAR(64) NULL AFTER producer_fence_token', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'claim_expires_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN claim_expires_at DATETIME(6) NULL AFTER claim_token', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'idx_af_file_info_artifact_batch');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_artifact_batch (user_id, ai_job_id, artifact_batch_id, status)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'idx_af_file_info_artifact_recovery');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_artifact_recovery (status, claim_expires_at, updated_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'uk_af_file_info_artifact_ordinal');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD UNIQUE INDEX uk_af_file_info_artifact_ordinal (user_id, artifact_batch_id, artifact_ordinal)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
