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

CREATE TABLE IF NOT EXISTS af_settings_profile (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    environment VARCHAR(32) NOT NULL,
    default_timeout_min INT NOT NULL DEFAULT 45,
    retention_days INT NOT NULL DEFAULT 30,
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

CREATE TABLE IF NOT EXISTS af_workspace (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    region VARCHAR(64) NOT NULL,
    environment VARCHAR(32) NOT NULL,
    owner_user_id BIGINT,
    owner_name VARCHAR(128),
    member_count INT NOT NULL DEFAULT 1,
    default_timeout_min INT NOT NULL DEFAULT 45,
    retention_days INT NOT NULL DEFAULT 30,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workspace_slug (slug),
    KEY idx_af_workspace_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_project (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workspace_id BIGINT,
    workspace_name VARCHAR(128),
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    owner_user_id BIGINT,
    owner_name VARCHAR(128),
    environment VARCHAR(32) NOT NULL,
    health VARCHAR(32) NOT NULL,
    scenario VARCHAR(32) NOT NULL,
    sla_target VARCHAR(64),
    queue_depth INT NOT NULL DEFAULT 0,
    knowledge_count INT NOT NULL DEFAULT 0,
    last_run_status VARCHAR(32) NOT NULL,
    workflow_count INT NOT NULL DEFAULT 0,
    active_run_count INT NOT NULL DEFAULT 0,
    file_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_project_workspace (workspace_id),
    KEY idx_af_project_status (status),
    KEY idx_af_project_updated (updated_at)
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

CREATE TABLE IF NOT EXISTS af_copilot_conversation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(128) NOT NULL,
    workflow_id VARCHAR(128),
    project_id VARCHAR(128),
    status VARCHAR(32) NOT NULL,
    message_count INT NOT NULL DEFAULT 0,
    last_message_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_copilot_conversation_updated (updated_at),
    KEY idx_af_copilot_conversation_workflow (workflow_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_copilot_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    conversation_id BIGINT NOT NULL,
    role VARCHAR(32) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_copilot_message_conversation (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS af_knowledge_dataset (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(128) NOT NULL,
    description VARCHAR(512),
    status VARCHAR(32) NOT NULL,
    document_count INT NOT NULL DEFAULT 0,
    processing_document_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    failed_chunk_count INT NOT NULL DEFAULT 0,
    hit_rate INT NOT NULL DEFAULT 0,
    embedding_model VARCHAR(128) NOT NULL,
    retrieval_mode VARCHAR(128) NOT NULL,
    owner VARCHAR(128),
    tags_json LONGTEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_dataset_status (status),
    KEY idx_af_knowledge_dataset_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_knowledge_document (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(64) NOT NULL,
    file_id VARCHAR(128),
    mode VARCHAR(64) NOT NULL,
    char_count INT NOT NULL DEFAULT 0,
    chunk_count INT NOT NULL DEFAULT 0,
    recall_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    uploaded_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_document_dataset (dataset_id),
    KEY idx_af_knowledge_document_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS af_knowledge_chunk (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    source VARCHAR(255),
    preview LONGTEXT,
    tokens INT NOT NULL DEFAULT 0,
    score DOUBLE NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    chunk_index INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_chunk_dataset (dataset_id),
    KEY idx_af_knowledge_chunk_document (document_id),
    KEY idx_af_knowledge_chunk_status (status)
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

