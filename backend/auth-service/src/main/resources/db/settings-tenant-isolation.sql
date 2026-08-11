DELIMITER //

CREATE PROCEDURE af_settings_add_column_if_missing(
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
        SET @settings_sql = ddl_value;
        PREPARE settings_stmt FROM @settings_sql;
        EXECUTE settings_stmt;
        DEALLOCATE PREPARE settings_stmt;
    END IF;
END//

CREATE PROCEDURE af_settings_drop_index_if_exists(
    IN table_name_value VARCHAR(64),
    IN index_name_value VARCHAR(64)
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND INDEX_NAME = index_name_value
    ) THEN
        SET @settings_sql = CONCAT('ALTER TABLE ', table_name_value, ' DROP INDEX ', index_name_value);
        PREPARE settings_stmt FROM @settings_sql;
        EXECUTE settings_stmt;
        DEALLOCATE PREPARE settings_stmt;
    END IF;
END//

CREATE PROCEDURE af_settings_add_index_if_missing(
    IN table_name_value VARCHAR(64),
    IN index_name_value VARCHAR(64),
    IN ddl_value TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = table_name_value
          AND INDEX_NAME = index_name_value
    ) THEN
        SET @settings_sql = ddl_value;
        PREPARE settings_stmt FROM @settings_sql;
        EXECUTE settings_stmt;
        DEALLOCATE PREPARE settings_stmt;
    END IF;
END//

DELIMITER ;

CALL af_settings_add_column_if_missing('af_settings_profile', 'owner_user_id',
    'ALTER TABLE af_settings_profile ADD COLUMN owner_user_id BIGINT NULL AFTER id');
CALL af_settings_add_column_if_missing('af_settings_member', 'owner_user_id',
    'ALTER TABLE af_settings_member ADD COLUMN owner_user_id BIGINT NULL AFTER id');
CALL af_settings_add_column_if_missing('af_settings_billing', 'owner_user_id',
    'ALTER TABLE af_settings_billing ADD COLUMN owner_user_id BIGINT NULL AFTER id');
CALL af_settings_add_column_if_missing('af_settings_audit_event', 'owner_user_id',
    'ALTER TABLE af_settings_audit_event ADD COLUMN owner_user_id BIGINT NULL AFTER id');

SET @settings_demo_user_id = (
    SELECT id
    FROM af_user
    WHERE username = 'aether.operator'
    ORDER BY id
    LIMIT 1
);
SET @settings_demo_user_id = COALESCE(@settings_demo_user_id, (SELECT id FROM af_user ORDER BY id LIMIT 1), 0);

UPDATE af_settings_profile SET owner_user_id = @settings_demo_user_id WHERE owner_user_id IS NULL;
UPDATE af_settings_member SET owner_user_id = @settings_demo_user_id WHERE owner_user_id IS NULL;
UPDATE af_settings_billing SET owner_user_id = @settings_demo_user_id WHERE owner_user_id IS NULL;
UPDATE af_settings_audit_event SET owner_user_id = @settings_demo_user_id WHERE owner_user_id IS NULL;

CALL af_settings_drop_index_if_exists('af_settings_profile', 'uk_af_settings_profile_slug');
CALL af_settings_drop_index_if_exists('af_settings_member', 'uk_af_settings_member_email');
CALL af_settings_add_index_if_missing('af_settings_profile', 'uk_af_settings_profile_owner_slug',
    'ALTER TABLE af_settings_profile ADD UNIQUE KEY uk_af_settings_profile_owner_slug (owner_user_id, slug)');
CALL af_settings_add_index_if_missing('af_settings_profile', 'idx_af_settings_profile_owner',
    'ALTER TABLE af_settings_profile ADD INDEX idx_af_settings_profile_owner (owner_user_id)');
CALL af_settings_add_index_if_missing('af_settings_member', 'uk_af_settings_member_owner_email',
    'ALTER TABLE af_settings_member ADD UNIQUE KEY uk_af_settings_member_owner_email (owner_user_id, email)');
CALL af_settings_add_index_if_missing('af_settings_member', 'idx_af_settings_member_owner',
    'ALTER TABLE af_settings_member ADD INDEX idx_af_settings_member_owner (owner_user_id)');
CALL af_settings_add_index_if_missing('af_settings_billing', 'uk_af_settings_billing_owner',
    'ALTER TABLE af_settings_billing ADD UNIQUE KEY uk_af_settings_billing_owner (owner_user_id)');
CALL af_settings_add_index_if_missing('af_settings_audit_event', 'idx_af_settings_audit_event_owner',
    'ALTER TABLE af_settings_audit_event ADD INDEX idx_af_settings_audit_event_owner (owner_user_id)');

ALTER TABLE af_settings_profile MODIFY owner_user_id BIGINT NOT NULL;
ALTER TABLE af_settings_member MODIFY owner_user_id BIGINT NOT NULL;
ALTER TABLE af_settings_billing MODIFY owner_user_id BIGINT NOT NULL;
ALTER TABLE af_settings_audit_event MODIFY owner_user_id BIGINT NOT NULL;

DROP PROCEDURE IF EXISTS af_settings_add_column_if_missing;
DROP PROCEDURE IF EXISTS af_settings_drop_index_if_exists;
DROP PROCEDURE IF EXISTS af_settings_add_index_if_missing;
