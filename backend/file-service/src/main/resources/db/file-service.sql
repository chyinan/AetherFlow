CREATE TABLE IF NOT EXISTS af_file_info (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    uploader_id BIGINT,
    bucket VARCHAR(128) NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(128),
    mime_type VARCHAR(128),
    file_hash VARCHAR(64),
    file_size BIGINT,
    file_url VARCHAR(1024) NOT NULL,
    status VARCHAR(32) NOT NULL,
    upload_duration BIGINT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_file_info_object (bucket, object_key),
    KEY idx_af_file_info_hash (file_hash),
    KEY idx_af_file_info_user (user_id),
    KEY idx_af_file_info_uploader (uploader_id),
    KEY idx_af_file_info_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND index_name = 'uk_af_file_info_object'
);
SET @sql = IF(@idx_exists > 0,
    'ALTER TABLE af_file_info DROP INDEX uk_af_file_info_object',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND column_name = 'uploader_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_file_info ADD COLUMN uploader_id BIGINT NULL AFTER user_id',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND column_name = 'mime_type'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_file_info ADD COLUMN mime_type VARCHAR(128) NULL AFTER content_type',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND column_name = 'file_hash'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_file_info ADD COLUMN file_hash VARCHAR(64) NULL AFTER mime_type',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(1)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND column_name = 'upload_duration'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE af_file_info ADD COLUMN upload_duration BIGINT NULL AFTER status',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND index_name = 'idx_af_file_info_object'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_object (bucket, object_key)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND index_name = 'idx_af_file_info_hash'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_hash (file_hash)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
    SELECT COUNT(1)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_file_info'
      AND index_name = 'idx_af_file_info_uploader'
);
SET @sql = IF(@idx_exists = 0,
    'ALTER TABLE af_file_info ADD INDEX idx_af_file_info_uploader (uploader_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
