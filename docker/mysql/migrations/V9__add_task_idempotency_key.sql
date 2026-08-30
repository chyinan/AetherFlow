DELIMITER //

CREATE PROCEDURE af_add_task_idempotency_v9()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'af_task_record'
          AND COLUMN_NAME = 'idempotency_key'
    ) THEN
        ALTER TABLE af_task_record ADD COLUMN idempotency_key VARCHAR(128) NULL AFTER workflow_instance_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'af_task_record'
          AND INDEX_NAME = 'uk_af_task_record_idempotency'
    ) THEN
        ALTER TABLE af_task_record ADD UNIQUE KEY uk_af_task_record_idempotency (idempotency_key);
    END IF;
END//

CALL af_add_task_idempotency_v9()//
DROP PROCEDURE af_add_task_idempotency_v9//

DELIMITER ;
