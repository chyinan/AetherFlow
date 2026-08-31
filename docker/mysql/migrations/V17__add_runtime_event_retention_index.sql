CREATE INDEX idx_af_workflow_runtime_event_occurred_at
    ON af_workflow_runtime_event (occurred_at, id);
