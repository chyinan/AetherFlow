DELIMITER //

CREATE PROCEDURE migrate_task_trace_id()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'af_task_record'
          AND COLUMN_NAME = 'trace_id'
    ) THEN
        ALTER TABLE af_task_record ADD COLUMN trace_id VARCHAR(64) NULL AFTER workflow_instance_id;
        UPDATE af_task_record
        SET trace_id = REPLACE(UUID(), '-', '')
        WHERE trace_id IS NULL OR trace_id = '';
        ALTER TABLE af_task_record MODIFY COLUMN trace_id VARCHAR(64) NOT NULL;
    END IF;
END//

CALL migrate_task_trace_id()//
DROP PROCEDURE migrate_task_trace_id//

DELIMITER ;
