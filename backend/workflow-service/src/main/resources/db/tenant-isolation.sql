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

CREATE PROCEDURE af_add_index_if_missing(
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
        SET @sql = ddl_value;
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END//

DELIMITER ;

CALL af_add_column_if_missing('af_workflow_definition', 'project_id',
    'ALTER TABLE af_workflow_definition ADD COLUMN project_id BIGINT AFTER description');
CALL af_add_column_if_missing('af_workflow_definition', 'owner_user_id',
    'ALTER TABLE af_workflow_definition ADD COLUMN owner_user_id BIGINT AFTER project_id');
CALL af_add_column_if_missing('af_workflow_definition', 'owner_name',
    'ALTER TABLE af_workflow_definition ADD COLUMN owner_name VARCHAR(128) AFTER owner_user_id');
CALL af_add_index_if_missing('af_workflow_definition', 'idx_af_workflow_definition_owner',
    'ALTER TABLE af_workflow_definition ADD INDEX idx_af_workflow_definition_owner (owner_user_id)');
CALL af_add_index_if_missing('af_workflow_definition', 'idx_af_workflow_definition_project',
    'ALTER TABLE af_workflow_definition ADD INDEX idx_af_workflow_definition_project (project_id)');

CALL af_add_index_if_missing('af_workspace', 'idx_af_workspace_owner',
    'ALTER TABLE af_workspace ADD INDEX idx_af_workspace_owner (owner_user_id)');
CALL af_add_index_if_missing('af_project', 'idx_af_project_owner',
    'ALTER TABLE af_project ADD INDEX idx_af_project_owner (owner_user_id)');

CALL af_add_column_if_missing('af_knowledge_dataset', 'owner_user_id',
    'ALTER TABLE af_knowledge_dataset ADD COLUMN owner_user_id BIGINT AFTER retrieval_mode');
CALL af_add_index_if_missing('af_knowledge_dataset', 'idx_af_knowledge_dataset_owner',
    'ALTER TABLE af_knowledge_dataset ADD INDEX idx_af_knowledge_dataset_owner (owner_user_id)');

SET @demo_user_id = (
    SELECT id
    FROM af_user
    WHERE username = 'aether.operator'
    ORDER BY id
    LIMIT 1
);
SET @demo_user_id = COALESCE(@demo_user_id, (SELECT id FROM af_user ORDER BY id LIMIT 1), 1);
SET @demo_username = 'aether.operator';

UPDATE af_workspace
SET owner_user_id = @demo_user_id,
    owner_name = COALESCE(NULLIF(owner_name, ''), @demo_username)
WHERE owner_user_id IS NULL;

UPDATE af_project
SET owner_user_id = @demo_user_id,
    owner_name = COALESCE(NULLIF(owner_name, ''), @demo_username)
WHERE owner_user_id IS NULL;

UPDATE af_workflow_definition
SET owner_user_id = @demo_user_id,
    owner_name = COALESCE(NULLIF(owner_name, ''), @demo_username)
WHERE owner_user_id IS NULL;

UPDATE af_knowledge_dataset
SET owner_user_id = @demo_user_id,
    owner = COALESCE(NULLIF(owner, ''), @demo_username)
WHERE owner_user_id IS NULL;

UPDATE af_workflow_instance
SET user_id = @demo_user_id
WHERE user_id IS NULL OR user_id = 0;

DROP PROCEDURE IF EXISTS af_add_column_if_missing;
DROP PROCEDURE IF EXISTS af_add_index_if_missing;
