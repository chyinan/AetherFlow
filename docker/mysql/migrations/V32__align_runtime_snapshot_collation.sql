-- 统一 workflow runtime 快照/事件表的排序规则。
--
-- 本库默认排序规则是 utf8mb4_unicode_ci，而 MySQL 8 驱动连接默认使用
-- utf8mb4_0900_ai_ci；WorkflowRuntimeSnapshotMapper 建表时未显式声明
-- COLLATE，于是两边不一致，WorkflowInstanceMapper.cancelIfActive 里的
--   s.workflow_id = CAST(i.id AS CHAR)
-- 会抛 ERROR 1267 Illegal mix of collations，表现为「取消运行」返回 500。
--
-- CONVERT TO 是幂等的：目标排序规则已一致时只做一次空重建。

ALTER TABLE af_workflow_runtime_snapshot
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

ALTER TABLE af_workflow_runtime_event
    CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
