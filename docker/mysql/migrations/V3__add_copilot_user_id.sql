ALTER TABLE af_copilot_conversation
    ADD COLUMN user_id BIGINT NOT NULL DEFAULT 0 AFTER id;

CREATE INDEX idx_af_copilot_conversation_user
    ON af_copilot_conversation (user_id);
