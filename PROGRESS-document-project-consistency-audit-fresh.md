# 进度追踪：开题报告与项目企业级一致性审计

> 创建时间：2026-08-31 | 状态：进行中

## 目标
对照开题报告与当前 AetherFlow 项目实际代码、配置、测试和部署能力，识别文档承诺但项目未完成或未实现的功能，并按企业级产品标准审查并发承载、租户/用户隔离、稳定性、故障恢复和可用性。

## 成功标准
形成有证据的逐项结论（已实现、部分实现、未发现/未实现、无法证实），指出对应文件与代码/配置依据；单独给出不满足企业级要求的架构与验证缺口；不把演示级可用性等同于投产级可用性。

## 已读文件
<!-- 每读一个文件就追加一行，格式：- `路径` — 读到了什么关键信息 -->
- `summary/thesis-project-contract-audit-2026-08-31.md` — 旧审计线索：启动 Outbox、FFmpeg 预检/产物、多副本任务 CAS、实时链路和容量证据存在风险
- `summary/report-function-commitments.md` — 旧审计整理的开题报告功能承诺基线
- `summary/enterprise-report-commitments.md` — 旧审计按页整理的企业级审查基线
- `summary/enterprise-consistency-audit-report.md` — 旧审计结论与验证记录，仅作为待复核线索
- `C:/Users/chyinan/Downloads/陈胤安 广州工商学院本科毕业论文（设计）开题报告  (1).docx` — 重新提取当前文档；核心承诺集中在微服务、DAG 编排、八类 AI/数据节点、异步调度、文件统一管理、实时通知、Provider 容错、容器部署与高并发/异常恢复测试
- `README.md` — 当前产品定位、正式/演示开关、服务拓扑、构建测试与性能门禁入口
- `pom.xml` — Java 17/Spring Boot 3.2.12、多模块服务及 Micrometer/Prometheus/OTel 依赖
- `frontend/package.json` — Vue 3/TypeScript/Vite/Vitest 及工作流、通知、生产安全契约检查脚本
- `docker-compose.yml` — 单机基础设施、服务资源限制、健康检查、模型开关与 RabbitMQ/MinIO/Nacos 配置
- `docker-compose.ha.yml` — 仅无状态业务服务双副本覆盖，状态组件依赖外部 HA
- `docker-compose.tls.yml` — 可选 Nginx TLS 覆盖层
- `AGENTS.md` — 当前工业级契约与投产验证门禁
- `performance-test/README.md` — 性能测试仅以真实环境小基线为最终层，Mock 契约不能替代容量证据
- `ai-runtime/README.md` — 本地媒体/模型演示 Runtime，不是正式生产服务
- `docs/architecture-review-report.md` — 项目自述的已关闭问题、仍成立风险和既有验证声明
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java` — 工作流定义 CRUD、ComfyUI 导入、复制、模板和启动接口均存在
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java` — 当前启动 Outbox claim/dispatch、用户/项目归属、DAG/配置/能力预检、复制和两个模板实现
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java` — 当前节点目录含独立 FFMPEG、WHISPER、OCR、Embedding、图像和输出等配置/变量契约
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/validation/WorkflowNodeConfigValidator.java` — 按目录字段做类型/枚举/必填检查，但缺少跨字段/变量存在性校验
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java` — 自研 DAG 并行执行、持久快照、Redis 工作流锁、等待/恢复/取消和重试路径
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowStartOutboxMapper.java` — 启动 Outbox 的 PENDING/DISPATCHING/DISPATCHED claim 和陈旧恢复
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/MybatisRuntimeSnapshotRepository.java` — 快照单库持久化、运行状态查询和 JVM 进程内保存锁
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java` — 运行查询、SSE/WS 令牌、取消和人工审批接口，并做实例归属校验
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java` — SSE 每秒轮询/心跳/游标和每进程 10000 workflow 缓存
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java` — 运行列表按用户过滤，但每个实例详情/列表会加载其全部事件后再取日志尾部
- `backend/task-service/src/main/java/com/aetherflow/task/service/TimeoutChecker.java` — 超时任务扫描后依赖状态 CAS
- `backend/task-service/src/main/java/com/aetherflow/task/service/RetryManager.java` — retry/dead-letter 状态和重投递逻辑
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiJobLeaseService.java` — AI Job 按用户+幂等键租约抢占、续租和 fencing
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java` — AI 终态事件 Outbox claim/retry/publish，并在成功事件中提交 artifact batch
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRouter.java` — LLM 按用户路由策略、超时、重试、熔断、故障切换和日志
- `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageProviderRegistry.java` — 图像 Provider 健康缓存和可用 Provider 顺序选择
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java` — 用户数据集隔离、ready 检索、topK/元数据过滤、全量分页语义回退和父子分片
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/vector/QdrantKnowledgeVectorIndex.java` — Qdrant 向量 upsert/search，按 datasetId 和 metadata 过滤
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java` — 文件归属、MinIO、分片上传、生成 artifact 状态机/回收
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationWebSocketHandler.java` — 用户级 WS 会话，但无连接数上限/心跳治理
- `docker/rabbitmq/definitions.json` — 预置队列不含 workflow AI result queue；该队列只由 Workflow Service 启动时声明
- `deploy/observability/prometheus.yml` / `deploy/observability/alerts.yml` — Prometheus 静态抓取和基础 HTTP/连接池/服务下线告警规则
- `performance-test/aetherflow-core-api.jmx` — 压测旅程包含登录、文件可选治理、AI 状态/Provider 状态、工作流创建/启动，但工作流仅为 START→TEMPLATE_TRANSFORM→END
- `frontend/scripts/check-workflow-node-backend-mapping.mjs` — 当前第一项生产契约检查仍错误要求 `ffmpeg -> UPLOAD`

## 当前进度
核心功能链路已完成第一轮追踪；正在专项核验多副本可靠性、跨用户隔离、队列/事件一致性和容量证据

## 下一步
完成数据/消息/实时链路和部署高可用核验，整理明确的承诺差距与投产阻断项。

## 发现的关键信息
- 旧 summary 指向多个潜在缺口，包括工作流启动 Outbox 时序、AI 任务崩溃接管、媒体产物闭环、高并发证据不足；这些均需在当前工作树重新验证。
- 文档明确承诺：账号资料维护、整个工作流复制和预设模板、FFmpeg 独立节点、Whisper 时间信息、OpenAI/Ollama、OCR、Embedding/RAG、Stable Diffusion/ComfyUI、输出查看下载、超时/重试/取消、Provider 按用户降级、状态通知、Docker/Nginx/Seata、典型场景与高并发/异常恢复测试。
- 新鲜回归：`mvn test` 通过，当前 Maven 报告汇总 705 项测试；前端 `npm test` 46 个文件/166 项通过；前端 `npm run build` 通过；两个 Python 测试集分别 21/4 项通过。
- 新鲜门禁：除 `check:workflow-mapping` 外其余 13 个前端 `check:*` 通过；`aetherflow-performance-contract-test.ps1` 在确定性 Mock Gateway 下 11 样本/0 错误；性能门禁自测通过；使用临时强密钥环境的 Compose config-only 通过并展开 25 个服务。
- 当前环境 Docker daemon 不可连接，因此没有真实容器健康、跨服务链路、真实 AI/媒体、故障注入或压力/浸泡证据。
- 已确认的当前风险线索：Workflow Service 只在启动时执行运行快照恢复；AI 结果队列未写入 RabbitMQ definitions；图像结果存储路径绕过 AI artifact batch 状态机；通知 WS 无连接上限；运行列表可能加载最多 100×10000 事件。
-
## 本轮实施目标

本轮开始按企业级投产标准修复上一轮审计发现的问题：消息可靠投递、跨副本恢复与快照一致性、幂等与取消、事件容量、用户/租户隔离、运行前置校验、文件产物闭环、前端发布门禁、部署高可用、观测告警和真实压测门禁。每项修复先增加回归测试，再修改实现，并以全量构建和测试作为交付条件。
