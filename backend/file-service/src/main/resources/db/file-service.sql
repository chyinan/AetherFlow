CREATE TABLE IF NOT EXISTS af_file_info (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    bucket VARCHAR(128) NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    original_name VARCHAR(255),
    content_type VARCHAR(128),
    file_size BIGINT,
    file_url VARCHAR(1024) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_file_info_object (bucket, object_key),
    KEY idx_af_file_info_user (user_id),
    KEY idx_af_file_info_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
