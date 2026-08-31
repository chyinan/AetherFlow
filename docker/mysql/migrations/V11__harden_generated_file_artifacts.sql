SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'uploader_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN uploader_id BIGINT NULL AFTER user_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'mime_type');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN mime_type VARCHAR(128) NULL AFTER content_type', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'file_hash');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN file_hash VARCHAR(64) NULL AFTER mime_type', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'upload_duration');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN upload_duration BIGINT NULL AFTER status', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND column_name = 'idempotency_key');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE af_file_info ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER workflow_id', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'uk_af_file_info_object');
SET @sql = IF(@idx_exists > 0, 'ALTER TABLE af_file_info DROP INDEX uk_af_file_info_object', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'idx_af_file_info_object');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_object (bucket, object_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'idx_af_file_info_hash');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_hash (file_hash)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'idx_af_file_info_uploader');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_uploader (uploader_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'af_file_info' AND index_name = 'uk_af_file_info_user_idempotency');
SET @sql = IF(@idx_exists = 0, 'ALTER TABLE af_file_info ADD UNIQUE INDEX uk_af_file_info_user_idempotency (user_id, idempotency_key)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
