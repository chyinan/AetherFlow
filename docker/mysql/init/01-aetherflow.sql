CREATE DATABASE IF NOT EXISTS aetherflow DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aetherflow;

CREATE TABLE IF NOT EXISTS af_user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_workflow_definition (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    definition_json LONGTEXT NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_workflow_definition_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_workflow_instance (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    definition_id BIGINT NOT NULL,
    user_id BIGINT,
    status VARCHAR(32) NOT NULL,
    input_json LONGTEXT,
    current_node_id VARCHAR(128),
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    updated_at DATETIME NOT NULL,
    KEY idx_af_workflow_instance_definition (definition_id),
    KEY idx_af_workflow_instance_user (user_id),
    KEY idx_af_workflow_instance_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_task_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_instance_id BIGINT NOT NULL,
    node_id VARCHAR(128) NOT NULL,
    node_type VARCHAR(64) NOT NULL,
    payload_json LONGTEXT,
    retry_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    next_retry_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_task_record_instance (workflow_instance_id),
    KEY idx_af_task_record_status_retry (status, next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_ai_job (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    task_id BIGINT,
    workflow_instance_id BIGINT,
    job_type VARCHAR(64) NOT NULL,
    input_json LONGTEXT,
    output_json LONGTEXT,
    status VARCHAR(32) NOT NULL,
    started_at DATETIME NOT NULL,
    completed_at DATETIME,
    updated_at DATETIME NOT NULL,
    KEY idx_af_ai_job_task (task_id),
    KEY idx_af_ai_job_instance (workflow_instance_id),
    KEY idx_af_ai_job_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS af_notification_record (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT,
    channel VARCHAR(64),
    event_type VARCHAR(128) NOT NULL,
    payload_json LONGTEXT,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    KEY idx_af_notification_user (user_id),
    KEY idx_af_notification_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

