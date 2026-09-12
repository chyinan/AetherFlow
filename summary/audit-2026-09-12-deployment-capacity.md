# 当前部署与容量核验

2026-09-12，基于工作区 HEAD b180163192555f0e13ad8ee7f603ef106f3ae59a 及全部既有未提交改动；本次只在本机 Docker Compose 环境重新构建并启动当前源码镜像，未触碰线上环境或删除持久化卷。

## 已有能力与不能沿用的旧结论

- Java 镜像已增加 Actuator HEALTHCHECK（docker/java-service.Dockerfile:29）。
- Swarm 各应用已有 CPU、内存、PID 资源限制（docker-stack.yml:4-12、29 等），不能说“完全没有限制”。
- Alertmanager 已有 webhook 占位与 prod 缺失退出机制（deploy/observability/alertmanager.yml:16；docker-compose.yml:287-295），不能说“只有空 receiver”；实际通知送达未验证。
- CI 已增加前端测试/契约脚本与 Python pytest（.github/workflows/ci.yml），不能沿用旧“CI 不跑这些测试”结论。
- 主工作流启动已移除 GlobalTransactional，使用本地事务；Seata 真实跨服务事务例子位于 dev demo。文档 P083 的治理技术描述只能按此边界表述。

## 当前具体问题

### OPS-01：容量门禁不验证任务执行完成（P1，验收缺陷）

performance-test/aetherflow-core-api.jmx:394-432 只创建 START/TEMPLATE_TRANSFORM/END 流程，后续唯一运行调用是 start instance。完整枚举 HTTP samplers 后，未见实例终态轮询、运行结果校验或事件续传验证；AI 只调用 status/metrics，没有 Whisper、FFmpeg、LLM、图像推理。通用断言只检查 Result code。

因此“返回一个 PENDING 实例，但任务根本未执行”也能通过当前计划；这恰好遗漏本次发现的启动幂等分支故障。启动幂等缺陷已在源码中修复，但 aetherflow-capacity-gate.ps1:33-60 仍不能作为文档 P086 所述高并发任务执行/队列消费/服务保护的完整证明。

### OPS-02：缺当前版本真实容量和故障恢复证据（P1，未验收）

当前工作区未找到 capacity-evidence.json。performance-test/results 现有 JTL 来自 2026-05/06，两个 load-check 文件只有表头，其他多数为少量诊断请求；不能代表 2026-09-12 工作区。容量脚本只记录线程数、时长、Git commit 等，不自动保存同期 CPU、内存、GC、连接池、MQ backlog、GPU、存储延迟或 dirty worktree 摘要。没有搜索到匹配当前版本的真实持续压测、故障演练和 RPO/RTO 成果。

本次 JMeter 契约测试明确针对 deterministic mock gateway；它验证脚本和门禁，不验证产品吞吐。本次 Docker 验证证明当前 Compose 服务能启动并通过健康门禁，但仍未运行真实持续容量压测。无法据现有证据给出安全并发数/QPS/可用性百分比。

### OPS-03：外部 HA 依赖与 Swarm 模板配置未闭环（P1，条件触发）

docker-stack.yml:1-3 声明依赖外部 HA 服务。task-service 在 131-136 配置 RABBITMQ_HOST、fail-closed，但未传 RABBITMQ_MANAGEMENT_URL；application-prod.yml:57 的管理 API 默认仍为 http://rabbitmq:15672。按模板只填写必填外部地址、且没有另配 rabbitmq DNS 别名或 Nacos 覆盖时，AMQP 可连外部 RabbitMQ，但队列健康检查走错误地址；QueueMonitorService:100 和 QueueBackpressureGuard:43 会使提交被拒绝。

同样，Python 的 stack 配置 230-234 将配置 Redis 默认指向 redis，没有继承部署者填写的 REDIS_HOST；APP_ENV=prod 强制共享 Redis 可用（main.py:1060-1073）。主机/端口形式客户端不带 SSL（1077-1103），而 Java prod Redis 开启 TLS。部署者必须显式提供正确 AI_RUNTIME_CONFIG_REDIS_URL（例如 TLS 端点）或对应网络配置；仅按模板必填变量不足以保证 Python 可用。

上述是模板条件问题，不表示外部基础设施一定未部署，也不是本次已复现的远程故障。

### OPS-04：生产健康、监控与灾备仍有验收缺口（P1/P2）

- Python Compose 有健康检查（docker-compose.yml:244），但 python-ai-service/Dockerfile 无 HEALTHCHECK，docker-stack.yml:225-243 也未定义；Swarm 路径缺应用健康检测。
- Prometheus 仅静态抓取每种服务一个 DNS 地址（deploy/observability/prometheus.yml:13-27），文件自己要求生产更换服务发现；未提供多副本逐实例抓取、AI/GPU 重负载指标闭环的验证。
- 备份脚本只顺序导出 MySQL、Redis、MinIO（scripts/aetherflow-backup.ps1:23-35），未包含 Qdrant 向量快照与完整跨存储一致性恢复方案；恢复脚本有哈希校验，但没有当前版本完整业务恢复实测。
- Redis 开启 AOF（docker-compose.yml:70）；恢复脚本仅覆盖 dump.rdb 并重启（scripts/aetherflow-restore.ps1:31-36），没有处理已有 AOF。此处恢复语义须在隔离环境实测，不能仅凭退出码宣布恢复正确。

## 本次验证

- mvn test -B：BUILD SUCCESS，206 个 suite，734 用例，0 失败/错误/跳过。
- npm test：48 文件，173 用例通过；npm run build 通过。
- python-ai-service：25 passed；ai-runtime：4 passed；两个 venv pip check 通过。
- 性能门禁正反例通过；JMeter mock 契约测试通过。
- aetherflow-verify-deployment.ps1 -ConfigOnly：25 服务配置通过。
- aetherflow-verify-deployment.ps1：真实部署通过；/health、/api/actuator/health、/api/gateway/status 均返回 200，RabbitMQ 用户/队列可查询且无积压，关键服务全部 healthy。
- Docker Desktop Linux Engine 29.4.1：当前源码镜像重新构建并启动成功；RabbitMQ 自定义入口的幂等用户检测已修复，重启次数为 0。

命令日志见 summary/audit-2026-09-12-validation/。首次 Maven 带未引用的 -Dstyle.color=never 被 PowerShell 拆分，属于命令调用错误；去掉该参数后完整重跑通过。
