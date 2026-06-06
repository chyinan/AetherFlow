CREATE TABLE IF NOT EXISTS af_settings_profile (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    environment VARCHAR(32) NOT NULL,
    default_timeout_min INT NOT NULL DEFAULT 45,
    retention_days INT NOT NULL DEFAULT 30,
    telegram_enabled TINYINT(1) NOT NULL DEFAULT 0,
    telegram_bot_token VARCHAR(255),
    telegram_chat_id VARCHAR(128),
    telegram_last_test_status VARCHAR(64),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_settings_profile_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_settings_member (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    last_seen VARCHAR(64) NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_settings_member_email (email),
    KEY idx_af_settings_member_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_settings_billing (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    plan VARCHAR(64) NOT NULL,
    ai_credits INT NOT NULL DEFAULT 0,
    monthly_budget VARCHAR(32) NOT NULL,
    current_spend VARCHAR(32) NOT NULL,
    renewal_at VARCHAR(32) NOT NULL,
    seat_used INT NOT NULL DEFAULT 0,
    seat_limit INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_settings_audit_event (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    occurred_at DATETIME NOT NULL,
    actor VARCHAR(128) NOT NULL,
    action VARCHAR(128) NOT NULL,
    target VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_settings_audit_event_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
