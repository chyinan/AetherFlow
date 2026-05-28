CREATE TABLE IF NOT EXISTS af_workflow_runtime_snapshot (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    workflow_id VARCHAR(64) NOT NULL,
    trace_id VARCHAR(128) NOT NULL,
    task_id VARCHAR(64) NOT NULL,
    definition_id BIGINT,
    definition_json LONGTEXT NOT NULL,
    runtime_state VARCHAR(32) NOT NULL,
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
    node_id VARCHAR(64),
    runtime_state VARCHAR(32) NOT NULL,
    occurred_at DATETIME NOT NULL,
    attributes_json LONGTEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_workflow_runtime_event_event (event_id),
    KEY idx_af_workflow_runtime_event_workflow (workflow_id, occurred_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
