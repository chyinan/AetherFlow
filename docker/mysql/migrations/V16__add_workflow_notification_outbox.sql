CREATE TABLE IF NOT EXISTS af_workflow_notification_outbox (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_instance_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    event_id VARCHAR(160) NOT NULL,
    status VARCHAR(32) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    payload_json LONGTEXT NOT NULL,
    next_attempt_at DATETIME(6),
    published_at DATETIME(6),
    last_error VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_af_workflow_notification_outbox_event (event_id),
    KEY idx_af_workflow_notification_outbox_due (status, next_attempt_at, updated_at),
    KEY idx_af_workflow_notification_outbox_instance (workflow_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
