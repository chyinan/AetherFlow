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

-- Recheck already-cancelled historical runs once. Task Service cancellation only updates active tasks.
INSERT IGNORE INTO af_workflow_cancellation_cleanup
    (workflow_instance_id, user_id, status, attempt_count, next_attempt_at, created_at, updated_at)
SELECT id, user_id, 'PENDING', 0, NOW(6), NOW(6), NOW(6)
  FROM af_workflow_instance
 WHERE status = 'CANCELLED' AND user_id IS NOT NULL AND user_id > 0;
