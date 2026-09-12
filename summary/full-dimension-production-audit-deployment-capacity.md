# AetherFlow 部署、可观测性与容量证据审计摘要

> 核验日期：2026-09-01  
> 状态：代码/配置审计完成，待新鲜验证命令。

## 已确认的投产基础

- Compose 基础设施和应用镜像版本大多固定；内部服务只 expose，公共入口为 Nginx，Gateway 调试口仅绑定 loopback。
- TLS 覆盖需要证书目录且 fail-closed，Nginx 配置 TLS 1.2/1.3、HSTS、CSP 和限流。
- Swarm stack 使用外部 HA 状态服务、无状态服务 2–3 副本、TLS config/secret 和 start-first 更新。
- Prometheus 私网抓取、Hikari/队列/5xx/服务下线告警规则存在。
- JMeter 门禁会校验 Result envelope、HTTP 错误率、P95/P99 和最小样本数，结果写独立目录。
- MySQL/Redis/MinIO 备份带 SHA-256 manifest，恢复脚本有显式 `-ConfirmRestore` 门禁。

## 生产阻断与证据缺口

### OPS-01：Alertmanager 没有实际接收器

- `alertmanager.yml` 只有 receiver 名称，没有 webhook、邮件或企业告警集成。
- 生产安全脚本只断言 Prometheus 指向 `alertmanager:9093`，没有检查通知渠道。
- 告警会进入一个无集成的 receiver，无法通知值班人员。

判定：P1；公网/企业生产应阻断。

### OPS-02：Swarm 滚动发布缺少应用健康与资源契约

- Nginx 镜像有 HEALTHCHECK；Java 与 Python 镜像没有。
- `docker-stack.yml` 也没有 healthcheck，且除少数 Compose anchor 外生产 stack 未定义大多数服务的 CPU/内存限制。
- Swarm 可把“进程已启动但 Spring/FastAPI 尚未就绪”的任务计为运行，start-first/rollback 无法基于真实 readiness。

判定：P1。

### OPS-03：当前容量门禁不覆盖开题报告承诺的重负载链路

- JMeter 只执行核心 HTTP、普通文件和 `START → TEMPLATE_TRANSFORM → END`。
- `aetherflow-capacity-gate.ps1` 是一个恒定线程组浸泡，不包含明确阶梯、突发峰值、消费者扩缩或依赖故障阶段。
- 没有真实 Whisper、FFmpeg、LLM、图像、多并发大文件、RabbitMQ 消费积压和恢复验证。

判定：P1 未证明项，不等于代码错误，但禁止宣称“抗大并发/极强稳定”。

### OPS-04：容量证据文件不采集同期系统指标

- `capacity-evidence.json` 只记录目标、threads、ramp、duration、Git commit 和结果目录。
- 脚本提示“inspect host metrics”，但不自动收集 CPU、内存、JVM、Hikari、RabbitMQ、Redis、MySQL、MinIO 或 GPU 指标。
- 当前本地最新非 fixture JTL 为 2026-06-03/06-02，不是当前版本证据。

判定：P1 证据链缺口。

### OPS-05：CI 没有执行完整投产回归

- Java：compile + `mvn test`。
- Frontend：只 `npm run build`，未运行 `npm test` 和所有 `check:*`。
- Python：依赖安装失败通过 `|| true` 被吞掉，只跑 Ruff，不跑 pytest。
- CI 未运行性能契约、生产安全检查、Compose config、依赖漏洞/Secret/镜像扫描。

判定：P1。

### OPS-06：灾备只是单机工具，尚非生产恢复闭环

- MySQL、Redis、MinIO 抓取并非跨存储一致性快照；备份未加密、无自动保留/异地复制。
- RabbitMQ 消息、Nacos 配置、Seata 状态、Qdrant 向量、Provider runtime 配置和告警配置不在备份中。
- 没有仓库内的新鲜恢复演练结果、RPO/RTO 和校验报告。

判定：P1 未证明项。

## 反过度工程检查

### BLOAT-01：Elasticsearch/Kibana 默认启动但无消费者

- 全仓库除 Compose/部署清单外没有 Elasticsearch/Kibana/Logstash/Filebeat 使用。
- 默认仍启动 Elasticsearch（1 GiB heap）和 Kibana，增加内存、升级、漏洞和备份面，却没有日志采集收益。

建议：在实际日志检索链路落地前移出默认 Compose，作为可选 profile；不必再引入新的日志平台。

### BLOAT-02：Seata 主链路没有跨服务事务收益

- 生产主路径仅 `startInstance()` 标注 GlobalTransactional，事务体只写 Workflow Service 本地表；Task/AI 调度在提交后异步执行。
- 真正跨服务回滚只存在 dev demo。
- Seata Server/Nacos 配置和各服务依赖扩大故障面，但没有保护主业务一致性；主链路实际依赖 Outbox/Saga。

建议：保留必须由明确跨服务 ACID 用例证明；否则从默认生产依赖中移除，继续使用本地事务 + Outbox。

### BLOAT-03：本地 HA 覆盖与固定 container_name 冲突

- `docker-compose.ha.yml` 声明 replicas=2，但基础 Compose 为所有应用设置固定 `container_name`。
- Compose 的固定容器名与横向扩容语义冲突；真正可执行的 HA 路径应明确只使用 `docker-stack.yml`。

建议：删除/更名为非生产演示覆盖，避免运维误用；不要维护两个相互冲突的 HA 入口。
