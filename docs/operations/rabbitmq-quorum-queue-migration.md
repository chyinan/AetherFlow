# RabbitMQ 队列可靠性迁移

AetherFlow 的任务、重试、通知、死信和工作流 AI 结果队列统一声明为 durable quorum queue，避免单节点 classic queue 在故障时丢失未确认消息。

这是一个需要运维窗口的队列类型迁移：RabbitMQ 不允许把已有同名 classic queue 原地改成 quorum queue。投产前必须按以下顺序执行：

1. 停止生产者和消费者，确认管理 API 中相关队列的 ready/unacked 消息已清空或完成备份。
2. 删除旧的同名 classic queue（仅删除已核对且属于 AetherFlow vhost 的队列）。
3. 使用最新 `docker/rabbitmq/definitions.json` 启动 RabbitMQ，再启动各服务，让应用声明 quorum queue。
4. 检查 `/api/health`、队列消费者数、未确认消息和死信计数；随后执行一次任务重试和通知演练。

在未完成迁移前，不要滚动升级单个服务副本，否则新旧声明会因 `PRECONDITION_FAILED` 导致服务启动失败。
