-- 循环体节点使用稳定的作用域路径，与任务服务 128 字符契约一致。
ALTER TABLE af_workflow_runtime_event MODIFY COLUMN node_id VARCHAR(128);
