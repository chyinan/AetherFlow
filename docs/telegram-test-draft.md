# Telegram 测试使用已保存的设置

在「设置 → 开发者接入」中，修改 Bot 通道开关、Chat ID 或输入新 Bot Token 后，需要先保存改动或恢复已保存值，才能发送测试消息。保存失败时保留草稿且不能发送测试；保存成功后可测试新配置（通道仍须启用）。清空已有 Chat ID 时不会测试；若保存后服务器保留了原 ID，表单会重新显示该 ID。Chat ID 前后空白或空白 Token 不构成设置改动；留空 Token 继续使用已配置的 Token。

测试仍调用无请求体的 `POST /settings/integrations/telegram/test`，仅发送到已保存的会话；不会自动保存草稿，也不会随测试传输草稿中的 Token 或 Chat ID。设置页使用同一条件禁用按钮并在点击处理时检查。
