DELIMITER //

CREATE PROCEDURE af_add_column_if_missing(
    IN table_name_value VARCHAR(64),
    IN column_name_value VARCHAR(64),
    IN ddl_value TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND COLUMN_NAME = column_name_value
    ) THEN
        SET @sql = ddl_value;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

CALL af_add_column_if_missing('af_settings_profile', 'telegram_enabled',
    'ALTER TABLE af_settings_profile ADD COLUMN telegram_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER retention_days');
CALL af_add_column_if_missing('af_settings_profile', 'telegram_bot_token',
    'ALTER TABLE af_settings_profile ADD COLUMN telegram_bot_token VARCHAR(255) AFTER telegram_enabled');
CALL af_add_column_if_missing('af_settings_profile', 'telegram_chat_id',
    'ALTER TABLE af_settings_profile ADD COLUMN telegram_chat_id VARCHAR(128) AFTER telegram_bot_token');
CALL af_add_column_if_missing('af_settings_profile', 'telegram_last_test_status',
    'ALTER TABLE af_settings_profile ADD COLUMN telegram_last_test_status VARCHAR(64) AFTER telegram_chat_id');

DROP PROCEDURE af_add_column_if_missing;
