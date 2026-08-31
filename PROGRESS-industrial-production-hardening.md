# 进度追踪：AetherFlow 工业级投产整改

> 创建时间：2026-08-30 | 状态：进行中

## 目标
按照真正工业级投产标准，完整解决 `summary/enterprise-consistency-audit-report.md` 中已确认的功能承诺差距、数据一致性、任务恢复、高并发、高可用、安全、可观测、灾备和容量验证问题。

## 完成标准
- 报告中的 P0、P1、P2 差距均有真实实现或经用户确认的等价工业级方案，不以降级文档承诺代替实现。
- AI 制品、任务状态和跨存储写入具备幂等、租户隔离、失败补偿、崩溃接管与可对账能力。
- 工作流和实时通知支持多副本、持久事件、游标重放和水平扩展。
- 生产部署具备 TLS、Secret、资源预算、健康探针、多副本、备份恢复、RPO/RTO 和可观测告警。
- 真实环境容量、峰值、浸泡和故障注入门禁通过，并保留可复核报告。
- `mvn test`、前端测试/构建、Python 测试、性能与部署门禁全部通过。

## 设计原则
- 正确性和可恢复性优先于吞吐优化。
- TDD：每个行为变更先写失败测试并确认 RED。
- Functional Core / Imperative Shell：业务规则与 I/O 分离，修改的应用代码文件标注模式。
- Defense in Depth：API、服务、存储和恢复层分别验证关键不变量。
- 每一阶段独立可运行、可回归，不留下半成品主路径。

## 分阶段计划
1. P0 制品存储与租户归属。
2. P0 AI 任务租约与崩溃接管。
3. Provider 超时与消费者并发。
4. 功能承诺缺口。
5. 分布式调度与可横向扩展实时通信。
6. HA、安全、可观测与灾备部署。
7. 真实容量与故障门禁。

## 已读文件
- `summary/enterprise-consistency-audit-report.md` — 工业级差距基线和整改顺序。
- `summary/enterprise-report-commitments.md` — 开题报告承诺基线。
- `python-ai-service/app/main.py` — ASR/字幕原先写临时文件并返回伪 objectKey，现已改为返回真实内容。
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiTaskProcessingServiceImpl.java` — 原先成功 Outbox 早于产物登记，现已调整为产物持久化成功后才记录终态。
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java` — 已接入生成制品的 MinIO 写入、租户元数据、状态和幂等处理。
- `docker/mysql/migrations/V11__harden_generated_file_artifacts.sql` — 统一补齐文件表字段、索引和生成制品幂等约束。

## 当前进度
前三批可靠性整改已通过全仓回归：制品存储、AI 任务租约/崩溃接管、Provider deadline 与消费者弹性；正在补齐剩余功能承诺缺口。

## 下一步
按 TDD 补齐独立 FFmpeg 节点、工作流复制/模板、账号资料维护和用户主动取消/重试。

## 已完成验证
- 进入整改前基线：Java Maven 聚合测试通过；前端 164 个测试通过；前端生产构建通过。
- P0 制品链路：file-service 定向 17 个测试通过；AI 制品、终态顺序、同步执行定向测试通过。
- Python 3.11 隔离环境按 `requirements.txt` 安装生产同版依赖，18 个 API 测试全部通过。
- 变更后 `mvn test` 聚合 10 个模块全部 BUILD SUCCESS。
- AI 租约/消息恢复：lease、heartbeat、fencing、终态 CAS、三档耐久延迟队列和 Publisher Confirm 定向测试及 AI 全量 123 项测试通过。
- Provider deadline：策略 cap、真实 Java HTTP read timeout、Python OpenAI/Ollama 内层 deadline 与 2–6 消费者弹性测试通过。
- 三批改造后再次执行 `mvn test`，10 个模块 BUILD SUCCESS；Python 19 项 API 测试通过。

## 发现与决策
- 不采用只修改论文表述的方式规避功能承诺，按产品目标补齐真实能力。
- P0 实现按单一逻辑修复分批提交验证，不做一次性大范围重写。
- Python Runtime 不持有 MinIO 凭据；生成字节统一交给 file-service，由存储边界生成真实对象键并写入租户元数据。
- AI 成功事件必须晚于产物持久化；存储失败进入 AI 重试/失败路径，不再只记 warn。
- 同步和异步 AI 节点都携带 user/workflow/task 上下文并复用同一制品持久化语义。
- AI Job 使用数据库 lease token、expiry、heartbeat 与 attempt；所有 retry/terminal 写入带 fencing token，丢失租约的旧 worker 不能覆盖接管者。
- 活跃 lease 的 Rabbit 重投不会被直接 ACK 丢失，而是经 5s/30s/120s 耐久 TTL 队列和 broker confirm 延迟重投。
- Provider 策略 timeout 作为每次调用的上限，并同步到 Java→Python 和 Python→OpenAI/Ollama 两层。
## 2026-08-31 复核结果

- 生成制品：DB 时间租约、fencing、批量提交/回滚、租户幂等、STAGED 不签名、对象引用保护和恢复任务已完成。
- AI/工作流：AI 任务上下文幂等校验、取消快照原子保护、异步能力预检、共享线程池和持久启动 Outbox 已完成。
- 运行时安全：Gateway 账户资料认证、真实邮箱、密码改动吊销当前 JWT、内部通知租户校验、Python API Key 与输入/并发闸门已完成。
- 生产部署：Swarm 可执行栈 `docker-stack.yml`、TLS Nginx config/secret 前置、内部 JDBC/Redis/Rabbit TLS、完整 MySQL/Redis/MinIO 恢复脚本已完成。
- 验证：Maven 全量测试、前端 165 项测试与生产构建、Python 21 项测试、性能门禁自测、Compose/Swarm 配置解析均通过；真实容器压测仍需在部署环境执行。
- 复审修正：AI 生产 Rabbit listener 已关闭无限 requeue；启动 Outbox 对 DISPATCHED/无快照崩溃可恢复；制品部分注册失败会在失败 Outbox 中保留 batch 上下文并执行 abort。
