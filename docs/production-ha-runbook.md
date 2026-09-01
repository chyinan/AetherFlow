# AetherFlow 生产 HA 与灾备运行手册

开发 Compose 只负责单机验证。生产启动必须叠加 `docker-compose.ha.yml`（无状态服务双副本）和 `docker-compose.tls.yml`（TLS 入口），并把 MySQL、Redis、RabbitMQ、MinIO、Nacos、Seata 接入各自的多节点集群或云托管服务。

发布前必须满足：

- Gateway、Auth、Workflow、Task、AI、File、Notify 至少两个副本，滚动发布 `start-first`，实例不能依赖固定 `container_name`。
- RabbitMQ 使用 quorum queue/镜像队列；Redis 使用 Sentinel/Cluster；MinIO 使用纠删码分布式集群；MySQL 使用 InnoDB Cluster/主从并验证自动切换。
- `NGINX_TLS_DIR` 必须包含 `fullchain.pem` 与 `privkey.pem`，并通过 `docker-compose.tls.yml` 启动；未提供证书时 Nginx 必须失败关闭，不能退回公网 HTTP。
- 使用 `scripts/aetherflow-backup.ps1` 生成带 SHA-256 manifest 的 MySQL/Redis/MinIO 备份；使用 `scripts/aetherflow-restore.ps1 -ConfirmRestore` 仅在隔离环境恢复演练后执行。
- 使用 `scripts/aetherflow-capacity-gate.ps1` 对真实 Gateway 运行阶梯、峰值和浸泡测试；`scripts/aetherflow-performance-contract-test.ps1` 只验证 JMeter 计划契约，不可作为容量结论。

恢复目标由部署方填写并纳入值班协议：数据库 RPO、对象存储 RPO、队列恢复时间、AI 重复计费上限、用户可见事件重放窗口。任何一个依赖无法给出自动接管与恢复证据时，发布状态必须保持 blocked。
Swarm deployment (the executable HA path) uses `docker-stack.yml`; publish all CI images first, create the overlay network, inject the production `.env`/secrets, then run:

```powershell
docker network create --driver overlay --attachable aetherflow
$env:TLS_DIR='C:\certs\aetherflow'
docker config create aetherflow-nginx-tls frontend/nginx/nginx.tls.conf
docker secret create aetherflow_tls_fullchain "$env:TLS_DIR\fullchain.pem"
docker secret create aetherflow_tls_privkey "$env:TLS_DIR\privkey.pem"
$env:AETHERFLOW_REGISTRY='registry.example.com/aetherflow'
$env:AETHERFLOW_IMAGE_TAG='2026.08.31'
# Required external endpoints used by every stack service:
$env:NACOS_ADDR='nacos-prod.example.com:8848'
$env:SEATA_ADDR='seata-prod.example.com:8091'
$env:MYSQL_HOST='mysql-prod.example.com'
$env:REDIS_HOST='redis-prod.example.com'
$env:RABBITMQ_HOST='rabbit-prod.example.com'
$env:MINIO_ENDPOINT='https://minio-prod.example.com'
$env:MINIO_PUBLIC_ENDPOINT='https://minio-prod.example.com'
docker stack deploy -c docker-stack.yml aetherflow
```

`docker-compose.ha.yml` remains the local Compose scaling overlay only and is not a Swarm input. Stateful endpoints must be external TLS-enabled clusters; do not run the single-node dependencies as the HA data plane.

## Observability and release evidence

Every Java service exposes Micrometer Prometheus metrics at `/actuator/prometheus` on its private service port. The local Compose topology includes Prometheus and Grafana for verification; production Swarm must attach an external Prometheus/Alertmanager plane and use `deploy/observability/prometheus.yml` and `deploy/observability/alerts.yml` as the starting scrape and alert policy.

The release gate must retain the exact image tag, Git commit, JMeter JTL, percentile summary, host CPU/memory/database-pool metrics, and queue depth for the full soak duration. A short contract test is only a wiring check and cannot be used as production capacity evidence.

Workflow start, terminal notification, AI artifact registration, and task retry records are durable outboxes. Operators must monitor rows that remain in `PENDING` or `DISPATCHING` beyond the configured lease window before declaring the system healthy.

Production semantic knowledge retrieval uses the external Qdrant index (`WORKFLOW_QDRANT_ENABLED=true` and `WORKFLOW_KNOWLEDGE_VECTOR_INDEX_REQUIRED=true`). The MySQL vector JSON path remains a development compatibility fallback only; do not enable it as the production retrieval data plane. Existing datasets must be re-indexed before enabling the fail-closed production flag; use `POST /knowledge/datasets/{id}/vector-index/reindex` per owned dataset and verify the returned indexed count.
## 本轮投产加固补充

- Workflow AI Result 使用预置的 quorum 队列 `aetherflow.workflow.ai-result.queue`；RabbitMQ definitions、Spring 声明和数据库迁移必须一起发布，禁止只重启 Workflow Service 期待运行时补建队列。
- 工作流运行快照和启动 Outbox 使用分布式租约/fencing token；生产副本必须共享 MySQL 和 Redis，禁止把 JVM 锁作为唯一一致性机制。
- Task Service 的 `TASK_QUEUE_FAIL_CLOSED` 必须保持 `true`；队列监控未知时拒绝新任务，直到 RabbitMQ 管理接口恢复。
- 生产工作流 Embedding 必须使用外部 Qdrant，`WORKFLOW_KNOWLEDGE_VECTOR_INDEX_REQUIRED=true` 且 `WORKFLOW_EMBEDDING_IN_MEMORY_ENABLED=false`。
- 生产 Workflow Service 镜像包含 Tesseract 中文/英文语言模型；上线前必须用真实图片和扫描 PDF 执行 OCR 验收。
- Prometheus 告警必须接入 Alertmanager 或企业统一告警平台；空 receiver 只能用于本地验证，不能作为生产通知方案。
