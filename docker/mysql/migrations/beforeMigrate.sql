-- Bootstrap repair for databases whose legacy init script stopped before
-- af_knowledge_chunk was created.  This callback runs before versioned
-- migrations, so V7 can remain checksum-stable while repairing the table.
SET sql_notes = 0;

DROP PROCEDURE IF EXISTS af_add_knowledge_column_if_missing_v7;
DROP PROCEDURE IF EXISTS af_add_knowledge_index_if_missing_v7;

CREATE TABLE IF NOT EXISTS af_knowledge_chunk (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dataset_id BIGINT NOT NULL,
    document_id BIGINT NOT NULL,
    parent_chunk_id BIGINT,
    chunk_type VARCHAR(32) NOT NULL DEFAULT 'general',
    source VARCHAR(255),
    preview LONGTEXT,
    metadata_json LONGTEXT,
    tokens INT NOT NULL DEFAULT 0,
    score DOUBLE NOT NULL DEFAULT 0,
    vector_json LONGTEXT,
    status VARCHAR(32) NOT NULL,
    chunk_index INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    KEY idx_af_knowledge_chunk_dataset (dataset_id),
    KEY idx_af_knowledge_chunk_document (document_id),
    KEY idx_af_knowledge_chunk_status (status),
    FULLTEXT KEY ft_af_knowledge_chunk_search (source, preview)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS undo_log (
    branch_id BIGINT NOT NULL,
    xid VARCHAR(128) NOT NULL,
    context VARCHAR(128) NOT NULL,
    rollback_info LONGBLOB NOT NULL,
    log_status INT NOT NULL,
    log_created DATETIME(6) NOT NULL,
    log_modified DATETIME(6) NOT NULL,
    UNIQUE KEY ux_undo_log (xid, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS global_table (
    xid VARCHAR(128) NOT NULL,
    transaction_id BIGINT,
    status TINYINT NOT NULL,
    application_id VARCHAR(32),
    transaction_service_group VARCHAR(32),
    transaction_name VARCHAR(128),
    timeout INT,
    begin_time BIGINT,
    application_data VARCHAR(2000),
    gmt_create DATETIME,
    gmt_modified DATETIME,
    PRIMARY KEY (xid),
    KEY idx_status_gmt_modified (status, gmt_modified),
    KEY idx_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS branch_table (
    branch_id BIGINT NOT NULL,
    xid VARCHAR(128) NOT NULL,
    transaction_id BIGINT,
    resource_group_id VARCHAR(32),
    resource_id VARCHAR(256),
    branch_type VARCHAR(8),
    status TINYINT,
    client_id VARCHAR(64),
    application_data VARCHAR(2000),
    gmt_create DATETIME(6),
    gmt_modified DATETIME(6),
    PRIMARY KEY (branch_id),
    KEY idx_xid (xid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lock_table (
    row_key VARCHAR(128) NOT NULL,
    xid VARCHAR(128),
    transaction_id BIGINT,
    branch_id BIGINT NOT NULL,
    resource_id VARCHAR(256),
    table_name VARCHAR(32),
    pk VARCHAR(36),
    status TINYINT NOT NULL DEFAULT '0',
    gmt_create DATETIME,
    gmt_modified DATETIME,
    PRIMARY KEY (row_key),
    KEY idx_status (status),
    KEY idx_branch_id (branch_id),
    KEY idx_xid (xid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS distributed_lock (
    lock_key CHAR(20) NOT NULL,
    lock_value VARCHAR(20) NOT NULL,
    expire BIGINT,
    PRIMARY KEY (lock_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO distributed_lock (lock_key, lock_value, expire) VALUES
    ('AsyncCommitting', ' ', 0), ('RetryCommitting', ' ', 0),
    ('RetryRollbacking', ' ', 0), ('TxTimeoutCheck', ' ', 0)
ON DUPLICATE KEY UPDATE expire = 0;

CREATE TABLE IF NOT EXISTS aetherflow_auth.undo_log LIKE aetherflow.undo_log;
CREATE TABLE IF NOT EXISTS aetherflow_workflow.undo_log LIKE aetherflow.undo_log;
CREATE TABLE IF NOT EXISTS aetherflow_runtime.undo_log LIKE aetherflow.undo_log;
CREATE TABLE IF NOT EXISTS aetherflow_task.undo_log LIKE aetherflow.undo_log;
CREATE TABLE IF NOT EXISTS aetherflow_file.undo_log LIKE aetherflow.undo_log;
CREATE TABLE IF NOT EXISTS aetherflow_notify.undo_log LIKE aetherflow.undo_log;

SET sql_notes = 1;
