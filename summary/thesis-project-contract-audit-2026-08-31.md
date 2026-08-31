# 开题报告与 AetherFlow 当前实现一致性审计（2026-08-31）

## 结论

AetherFlow 当前已具备真实的 Spring Cloud 微服务、Vue 工作流编辑器、自研 DAG Runtime、RabbitMQ AI 异步任务、MinIO 文件治理、知识库、SSE/WebSocket、Provider 路由和生产部署配置，不能再评价为空壳或普通演示项目。

但按企业级产品标准，当前仍不能宣称“可抗大并发、抗压能力强、极强稳定性和功能可用性”。原因包括一个会导致工作流重复执行的 P0 时序缺陷、若干前后端闭环缺口、任务扫描器在多副本下缺少 CAS，以及没有真实容量、浸泡、故障注入和恢复验收证据。

## 当前承诺矩阵

| 开题报告承诺 | 当前判定 | 依据与边界 |
| --- | --- | --- |
| Spring Cloud 微服务、Gateway、Nacos、OpenFeign | 已实现 | 根 `pom.xml`、各业务服务和 Gateway 路由存在。 |
| 注册、密码登录、第三方登录、退出、账号资料维护、统一鉴权 | 基本已实现 | `auth-service` 有注册/登录/刷新/登出、GitHub/Google OAuth、`/auth/profile`；Gateway 校验 JWT、黑名单和管理员路径。 |
| 工作流创建/编辑/保存/复制/删除/列表/预设模板 | 后端已实现，前端未完整接入 | `WorkflowController` 有复制和模板接口，但前端只有 API 导出和测试调用，没有页面实际调用。 |
| DAG 拖拽、节点连线、循环/结构校验 | 基本已实现 | Vue Flow、mapper、`WorkflowDag` 和 NodeRegistry 存在；节点具体配置并未在保存接口统一强校验。 |
| 文件输入、FFmpeg、Whisper、OCR、LLM、Embedding、图像生成、输出 | 部分已实现 | 节点和执行器均存在；AI/媒体/图像依赖外部运行时，Compose 默认关闭 LLM/Whisper/图像 Provider。FFmpeg 的产物结果无法自动映射为下游 `fileUrl`/`fileId` 变量。 |
| 异步任务、等待/运行/成功/失败/重试、超时和恢复 | 基本已实现但有启动调度缺陷 | AI Job lease、heartbeat、fencing、Outbox、等待看门狗存在；工作流启动 Outbox 与直接本地派发的状态转换不一致。 |
| 文件上传、下载、查询、删除、元数据、产物统一保存 | 基本已实现 | 普通文件和 AI 生成制品有 MinIO、租户归属、幂等、STAGED/AVAILABLE 状态和回收逻辑。 |
| SSE/WebSocket 实时状态和日志 | 基本已实现 | 工作流事件持久化、游标、心跳、短期工作流令牌和 Redis 通知 fanout 存在；实时连接容量和数据库轮询仍未真实验证。 |
| Provider 优先级、超时、限流、故障切换、恢复记录 | LLM 基本实现，整体部分实现 | LLM 有 timeout/retry/circuit/failover；图像 Provider 只有单 Provider 选择，没有同等级自动切换；路由策略使用全局 Redis key 且管理接口只允许管理员。 |
| RabbitMQ 解耦、Docker Compose/Nginx/Seata/Sentinel | 部分实现 | AI 节点走 RabbitMQ；工作流入口仍先写库后直接提交本地线程池；Seata 主启动事务内没有实际远程写入；Compose 是单机数据面，Swarm 栈依赖外部 HA 状态服务。 |
| 功能、接口、压力和高并发稳定性测试 | 功能回归通过，容量未证明 | Java/前端通过；JMeter 仅 Mock Gateway/1 线程 11 样本；Python 当前环境不可运行；没有真实 AI、长媒体、峰值、浸泡、依赖故障和恢复报告。 |

## P0：必须先阻断投产

### 工作流启动 Outbox 会造成重复执行

`WorkflowServiceImpl.startInstance()` 在插入实例后写入 `PENDING`，随后立即提交本地执行任务（`WorkflowServiceImpl.java:143-178`）。执行入口调用 `markDispatched()`，但该 SQL 只接受 `DISPATCHING` 状态（`WorkflowStartOutboxMapper.java:38-45`）。因此正常直达执行不会把 Outbox 从 `PENDING` 变成 `DISPATCHED`。

`WorkflowStartRecoveryJob` 每 5 秒扫描，`PENDING` 会再次被 claim 和执行；`dispatchPendingStarts()` 只跳过 `CANCELLED`，并只在 Outbox 已是 `DISPATCHED` 且已有快照时跳过。初次运行完成后 Outbox 仍可能为 `PENDING`，后续会重复运行整个工作流，造成重复 AI 调用、通知、导出文件和外部副作用。

现有测试只验证 Outbox 表和索引存在，没有覆盖“正常启动后 Outbox 终态”的时序（`WorkflowServiceImplTest.java:215-225`）。

### 后端能力预检漏掉 FFmpeg

AI 能力评估器已经计算 `ffmpegExecutable`（`AiWorkflowCapabilityEvaluator.java:30-35`），但工作流预检的 `requiredCapability()` 没有返回 `FFMPEG`（`WorkflowAiCapabilityPolicy.java:112-119`）。前端可禁用 FFmpeg，后端却可能在能力不可用时仍创建实例，最终在异步任务阶段才失败，违背服务端 fail-closed 契约。

## P1：当前功能与企业级要求的主要差距

1. **FFmpeg 组合闭环断裂**：AI 侧生成 `MEDIA` artifact，存储后只把 `mediaFileId/mediaUrl` 放入节点 output；`AiWorkflowNodeResultAdapter` 对 FFMPEG 没有派生变量映射。下游 Whisper 只读取 `fileUrl`/`fileId` 变量，前端 FFmpeg 输出目录也只声明文件名、类型、大小。
2. **保存阶段配置校验不足**：创建/更新工作流只执行 DAG/节点类型校验；`WorkflowNodeDTO` 的节点字段没有 `@NotBlank` 等配置约束，AI 能力预检只在启动阶段执行，部分缺失配置会进入运行态后才失败。
3. **多副本任务超时/重试可能重复投递**：`TimeoutChecker` 和 `RetryManager` 在每个 task-service 副本运行；`TaskStateService.mark()` 通过无条件 `updateById` 更新，扫描前没有租约/claim/CAS，可能多次发布同一任务。AI Job 幂等可降低模型重复执行，但不能消除队列和资源放大。
4. **工作流终态通知不是自动闭环**：运行时事件默认不投递到通知服务（`WORKFLOW_RUNTIME_EVENT_MQ_ENABLED=false`），自动通知主要来自 AI 任务或显式 `NOTIFY`/`HUMAN` 节点；纯本地工作流完成/失败不一定产生通知记录。
5. **Provider 策略不是用户/租户级**：策略存放在固定 Redis key `AI_PROVIDER:ROUTING_POLICY`，Provider 管理路径由 Gateway 按管理员角色保护；与“用户配置优先级和降级策略”的文档语义不完全一致。
6. **Embedding 节点默认内存向量存储**：默认 `vectorStoreProvider=memory`，实现标明 `durability=process-memory`；重启后丢失。知识库导入链路另有 MySQL `vector_json`，但这不等于所有 Embedding 工作流产物具备持久化。
7. **实时链路的高并发实现方式偏重数据库**：工作流 SSE/WS 每连接定时轮询；WS 默认 8 个线程、2000 连接，SSE 使用固定大小线程池；运行事件增量查询没有 SQL LIMIT，服务层才截断 500 条。高连接数或事件积压时会放大 MySQL 查询和 JVM 内存压力。
8. **语义检索正确但不具备大规模性能基础**：语义路径分页扫描整个数据集，在 JVM 对 `LONGTEXT vector_json` 做余弦计算；没有数据库向量索引或独立向量检索数据面。它满足当前“不可被固定词法候选上限截断”的正确性要求，但不能据此推断大规模检索吞吐。

## P2：生产成熟度差距

- 运行事件、快照和日志没有看到按租期归档/清理策略，长期运行会持续增大 MySQL。
- 全部服务没有发现显式 Hikari 连接池容量预算；数据库、Redis、RabbitMQ、MinIO 等基础设施也没有统一资源配额。
- Compose 基础数据面是 MySQL/Redis/RabbitMQ/MinIO/Nacos 单实例；Swarm 栈只是无状态服务副本，状态服务必须由外部 HA 集群提供，尚无本地可复核的自动接管、RPO/RTO 和恢复演练证据。
- 已有 Jaeger/OTel 接入，但没有 Prometheus/Grafana/Alertmanager 或日志采集链路作为 SLO 告警闭环。
- 真实 OCR 质量依赖 Tesseract 语言数据；当前 Tess4J 包可见 `eng/osd`，没有项目级中文 traineddata 交付，中文扫描件不应直接宣称稳定识别。

## 验证记录

- `mvn test`：当前 HEAD 全量 Java 回归通过，构建成功。
- `frontend`: `npm test` 通过（46 个测试文件、165 项测试）；`npm run build` 通过。
- `aetherflow-performance-gate-self-test.ps1`：通过正反例。
- `aetherflow-performance-contract-test.ps1`：Mock Gateway，1 线程，11 个样本，0 错误，通过。
- `aetherflow-verify-deployment.ps1 -ConfigOnly`：当前未初始化必需的 `AI_INTERNAL_TOKEN`，脚本正确阻止继续。
- Python API：当前工作区运行时缺少 `fastapi`/`pytest`，未形成新鲜 Python 回归证据。

## 投产结论

当前适合称为“功能较完整、具有生产化加固方向的 AI 工作流平台代码库”，不适合称为“已经证明可抗大并发且极强稳定性的企业级产品”。在修复启动 Outbox P0、FFmpeg 变量闭环、FFmpeg 服务端预检、多副本任务 CAS 后，仍必须用真实部署环境完成容量、浸泡、故障注入、恢复、重复执行率、消息丢失率、P95/P99、RPO/RTO 和资源饱和度门禁。
