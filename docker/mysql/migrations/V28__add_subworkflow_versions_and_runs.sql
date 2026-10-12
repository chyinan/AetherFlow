-- 定义版本只追加，不随画布更新；已有定义仅能回填迁移时的当前版本。
CREATE TABLE IF NOT EXISTS af_workflow_definition_version (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    definition_id BIGINT NOT NULL,
    version INT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    definition_json JSON NOT NULL,
    created_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_workflow_definition_version (definition_id, version),
    KEY idx_workflow_version_owner (owner_user_id, definition_id)
);
INSERT IGNORE INTO af_workflow_definition_version
    (definition_id, version, owner_user_id, definition_json, created_at)
SELECT id, COALESCE(version, 1), owner_user_id, definition_json, COALESCE(updated_at, NOW(6))
FROM af_workflow_definition WHERE owner_user_id IS NOT NULL AND definition_json IS NOT NULL;

-- 父节点路径包含迭代序号；同一节点恢复/重试只对应一个子实例。
CREATE TABLE IF NOT EXISTS af_workflow_child_run (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_instance_id BIGINT NOT NULL,
    parent_node_id VARCHAR(1000) NOT NULL,
    invocation_key CHAR(64) NOT NULL,
    child_instance_id BIGINT NOT NULL,
    definition_id BIGINT NOT NULL,
    definition_version INT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    output_mappings_json JSON NOT NULL,
    status VARCHAR(32) NOT NULL,
    next_attempt_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    UNIQUE KEY uk_workflow_child_invocation (parent_instance_id, invocation_key),
    UNIQUE KEY uk_workflow_child_instance (child_instance_id),
    KEY idx_workflow_child_due (status, next_attempt_at, id),
    KEY idx_workflow_child_owner (owner_user_id, parent_instance_id)
);
