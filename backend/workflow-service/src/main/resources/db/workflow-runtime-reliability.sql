CREATE TABLE IF NOT EXISTS af_workflow_runtime_snapshot (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_id VARCHAR(64) NOT NULL,
    trace_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    definition_id BIGINT,
    definition_json LONGTEXT NOT NULL,
    runtime_state VARCHAR(32) NOT NULL,
    fencing_token VARCHAR(128),
    current_node_ids_json LONGTEXT,
    completed_node_ids_json LONGTEXT,
    failed_node_ids_json LONGTEXT,
    variables_json LONGTEXT,
    node_outputs_json LONGTEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workflow_runtime_snapshot_workflow (workflow_id),
    KEY idx_af_workflow_runtime_snapshot_state (runtime_state, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_workflow_runtime_event (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    event_id VARCHAR(64) NOT NULL,
    workflow_id VARCHAR(64) NOT NULL,
    trace_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL,
    node_id VARCHAR(128),
    runtime_state VARCHAR(32) NOT NULL,
    occurred_at DATETIME NOT NULL,
    attributes_json LONGTEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workflow_runtime_event_event (event_id),
    KEY idx_af_workflow_runtime_event_workflow (workflow_id, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS af_workflow_cancellation_cleanup (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_instance_id BIGINT NOT NULL,
    user_id BIGINT,
    status VARCHAR(32) NOT NULL,
    lease_token VARCHAR(64),
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6),
    completed_at DATETIME(6),
    last_error VARCHAR(1000),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_af_workflow_cancellation_cleanup_instance (workflow_instance_id),
    KEY idx_af_workflow_cancellation_cleanup_due (status, next_attempt_at, updated_at),
    KEY idx_af_workflow_cancellation_cleanup_retention (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO af_workflow_cancellation_cleanup
    (workflow_instance_id, user_id, status, attempt_count, next_attempt_at, created_at, updated_at)
SELECT id, user_id, 'PENDING', 0, NOW(6), NOW(6), NOW(6)
  FROM af_workflow_instance
 WHERE status = 'CANCELLED' AND user_id IS NOT NULL AND user_id > 0;
