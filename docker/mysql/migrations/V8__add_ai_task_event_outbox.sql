CREATE TABLE IF NOT EXISTS af_ai_task_event_outbox (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ai_job_id BIGINT NOT NULL,
    task_id BIGINT,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload_json LONGTEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME,
    published_at DATETIME,
    last_error VARCHAR(1000),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE KEY uk_af_ai_task_outbox_event (event_id),
    KEY idx_af_ai_task_outbox_job (ai_job_id),
    KEY idx_af_ai_task_outbox_due (status, next_attempt_at),
    CONSTRAINT fk_af_ai_task_outbox_job
        FOREIGN KEY (ai_job_id) REFERENCES af_ai_job(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
