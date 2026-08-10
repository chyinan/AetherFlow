DELIMITER //

CREATE PROCEDURE migrate_task_user_id()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'af_task_record'
          AND COLUMN_NAME = 'user_id'
    ) THEN
        ALTER TABLE af_task_record ADD COLUMN user_id BIGINT NULL AFTER workflow_instance_id;
        UPDATE af_task_record SET user_id = 0 WHERE user_id IS NULL;
        ALTER TABLE af_task_record MODIFY COLUMN user_id BIGINT NOT NULL DEFAULT 0;
        ALTER TABLE af_task_record ADD INDEX idx_af_task_record_user (user_id);
    END IF;
END//

CALL migrate_task_user_id()//
DROP PROCEDURE migrate_task_user_id//

DELIMITER ;
