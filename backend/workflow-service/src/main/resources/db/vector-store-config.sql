CREATE TABLE IF NOT EXISTS af_vector_store_config (
    id BIGINT PRIMARY KEY,
    provider VARCHAR(32) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    base_url VARCHAR(1024) NOT NULL,
    api_key VARCHAR(4096),
    collection VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
