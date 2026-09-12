# Alertmanager 接收器

生产环境必须提供 `ALERTMANAGER_WEBHOOK_URL`（例如企业微信、钉钉、Slack 或内部事件网关的 HTTPS 地址）。Compose 启动脚本会把 URL 注入 Alertmanager 配置；当 `APP_ENV=prod` 且未提供 URL 时，Alertmanager 会故意启动失败，避免“告警已触发但无人接收”的假健康状态。

开发环境可以留空，此时仅运行 Prometheus 规则和 Alertmanager UI，不宣称有外部通知能力。
