CREATE TABLE IF NOT EXISTS af_workflow_start_outbox (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_instance_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6),
    last_error VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_af_workflow_start_outbox_instance (workflow_instance_id),
    KEY idx_af_workflow_start_outbox_due (status, next_attempt_at, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
