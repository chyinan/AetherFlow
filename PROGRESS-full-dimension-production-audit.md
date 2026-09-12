# 进度追踪：开题报告与项目投产能力全维度审核

> 创建时间：2026-09-01 | 状态：代码与门禁修复完成，真实投产演练待环境（工业投产加固分支 `codex/industrial-production-hardening`）

## 目标
以指定开题报告为需求基线，对 AetherFlow 的功能完整性、前后端一致性、用户体验、多租户隔离、安全性、可靠性、可观测性、性能、部署与可持续维护能力进行投产级全维度审核。

## 成功标准
- 完整提取开题报告的显式需求、验收目标与隐含约束。
- 建立“文档要求—后端实现—前端实现—测试—部署/运维证据”矩阵。
- 明确标注完整实现、部分实现、缺失、实现不完善、疑似 Bug 与无法验证项。
- 覆盖多租户隔离、权限、安全、幂等并发、数据一致性、可靠性、可观测性、性能容量、灾备部署和前端用户体验。
- 对关键结论提供可复现的文件、行号、接口、配置、测试或命令证据。
- 区分真实投产风险与缺少收益证据的过度工程，并给出按严重程度和修复收益排序的整改路线。

## 已知约束
- 本轮已按用户授权进入修复：修改业务代码、部署配置、测试与运维文档；保留无关用户改动。
- 保留用户已有改动，所有结论以当前工作区实际状态为准。
- 使用简体中文输出，命令兼容 Windows 11 / PowerShell。
- 项目目标是可持续稳定投产、多租户隔离、安全且不臃肿，而非仅满足毕设演示。

## 已读文件
<!-- 每读一个文件就追加一行，格式：- `路径` — 读到了什么关键信息 -->
- `C:\Users\chyinan\Downloads\陈胤安 广州工商学院本科毕业论文（设计）开题报告  (1).docx` — 已完成结构化提取和 16 页逐页视觉核验，形成 `DOC-*` 需求契约；实际文件名在“报告”和“(1)”之间有两个空格。
- `summary/document-project-consistency-audit-fresh.md` — 提供当前模块结构、既有功能线索、16 项待重新验证的投产风险及上一轮测试基线；本轮仅将其作为检索线索，不直接继承结论。
- `summary/thesis-project-contract-audit-2026-08-31.md` — 提供开题报告承诺矩阵和此前的 P0/P1/P2 线索；其中启动 Outbox、FFmpeg 闭环、任务多副本 CAS 等结论可能已被后续改动修复，必须重新追踪当前实现。
- `summary/enterprise-consistency-audit-report.md` — 提供更早版本的端到端缺口清单；大量结论已被后续功能和加固变更取代，可用于检查回归但不能作为当前状态证据。
- `summary/full-dimension-production-audit-document-contract.md` — 本轮新建的需求编号与验收语义基线，区分开题报告承诺和额外投产约束。
- `AGENTS.md` — 当前工业级契约要求启动 Outbox 抢占、跨副本幂等与保留、服务端节点目录校验、生产 Qdrant、私有指标和真实压测/故障演练。
- `README.md` — 项目对外宣称完整 DAG、文件治理、AI/媒体、知识库、实时反馈、身份设置、生产 Compose、追踪和性能门禁；需逐项验证主链路和运行证据。
- `Architect.md` — 记录 7 个可运行 Java 服务、Vue 前端、Python 正式服务/本地演示边界及主要链路；文档快照日期为 2026-08-30，不能替代当前源码核验。
- `pom.xml` — 聚合 common、workflow-runtime-api 与 7 个可运行服务，共 9 个 Maven 模块，Java 17 / Spring Cloud 2023.0.5。
- `frontend/package.json` — Vue 3/Vite/Pinia/Vue Flow 技术栈，包含单测、构建与 14 类静态/契约检查脚本。
- `backend/auth-service/src/main/java/com/aetherflow/auth/controller/UserController.java` — 注册、登录、刷新、登出、当前用户、资料读取/更新接口齐全；浏览器刷新令牌使用 HttpOnly Cookie。
- `backend/auth-service/src/main/java/com/aetherflow/auth/service/impl/UserServiceImpl.java` — 具备登录限流、失败审计、唯一性防竞态、刷新令牌轮换、访问令牌黑名单和资料/密码更新；用户名更新后现有 JWT 中的用户名不会同步刷新。
- `backend/common/src/main/java/com/aetherflow/common/dto/UserProfileUpdateRequest.java` — 用户名、邮箱和密码存在基本 Bean Validation，但密码只限制长度，未体现强度策略。
- `frontend/src/stores/authStore.ts` — 注册、登录、刷新、资料更新和登出已接真实 API；密码修改成功后主动清空本地会话。
- `frontend/src/api/modules/auth.ts` — 严格校验认证响应、角色映射和资料更新契约。
- `frontend/src/pages/auth/LoginPage.vue` — 登录/注册、GitHub/Google 可用性探测、键盘可访问弹窗已实现；所有登录/注册失败对用户只显示统一“不可用”文案。
- `frontend/src/pages/account/AccountPage.vue` — 资料和密码编辑入口存在；密码修改后会话被清除，但页面只显示“资料已保存”，没有明确要求重新登录或立即导航到登录页。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java` — 定义 CRUD、ComfyUI 导入、整个工作流复制、两个预设模板和启动接口已存在。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java` — 定义/实例按用户隔离，创建与启动支持可选幂等键；启动以 PENDING 实例和 Outbox 为唯一派发权威，并在事务提交后抢占；保存调用目录配置校验和启动能力预检。
- `backend/common/src/main/java/com/aetherflow/common/dto/WorkflowDefinitionDTO.java` — 名称和节点列表有 Bean Validation，幂等键为可选字段。
- `backend/common/src/main/java/com/aetherflow/common/dto/WorkflowNodeDTO.java` — 节点字段自身没有 Bean Validation，实际约束依赖 DAG 与服务端目录校验。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/validation/WorkflowNodeConfigValidator.java` — 校验目录必填、类型、枚举、变量名及知识检索/图像生成少量跨字段规则；未覆盖多数节点的“固定值或变量来源至少一个”可执行性约束。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java` — 目录包含 FFmpeg、Whisper、LLM、OCR、Embedding、知识检索、图像、Export 等节点；多数输入源字段均标为非必填。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowDefinitionMapper.java` — 定义幂等写使用 `(owner_user_id, idempotency_key)` 唯一键和 `LAST_INSERT_ID` 处理并发重试。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowInstanceMapper.java` — 实例幂等写、终态保护状态迁移和按用户取消 SQL 已实现。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowStartOutboxMapper.java` — PENDING/DISPATCHING/DISPATCHED 抢占、租约 token、心跳和重试 SQL 已实现；DISPATCHED 行每 30 分钟仍会被重新扫描并确认。
- `frontend/src/pages/workflows/WorkflowPage.vue` — 工作流复制和模板选择已真正接入页面；有未保存防护、导入、保存、能力提示和真实启动流程。
- `frontend/src/stores/workflowStore.ts` — 保存期间用编辑 revision 避免新编辑被误标为已保存；复制与模板状态已接服务层。
- `frontend/src/services/api/workflowApi.ts` — 定义保存、复制、模板和启动均接真实后端；生产启动没有发送 `idempotencyKey`。
- `frontend/src/api/mappers/workflowMapper.ts` — 工作流 DTO 映射未生成定义创建 `idempotencyKey`。
- `frontend/src/stores/runStore.ts` — 用户取消运行和实时恢复入口存在。
- `frontend/src/pages/runs/RunsPage.vue` — 运行详情展示、取消按钮和人工审批入口存在。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowStartRecoveryJob.java` — 每 5 秒持续派发启动 Outbox。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryRunner.java` — 服务启动时执行运行快照恢复与终态对账。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryJob.java` — 每 10 秒持续恢复超过 staleAfter 的 RUNNING/RETRYING 快照，旧“只启动扫描一次”结论已修复。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java` — 终态对账只更新实例，不创建通知 Outbox；读取固定最早终态快照，缺少已对账游标/标记。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowWaitingWatchdog.java` — 非 HUMAN 的 WAITING 节点有 30 分钟超时失败补偿。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/notification/WorkflowTerminalNotificationOutboxService.java` — 终态通知具备事件幂等键、抢占和重试，但 enqueue 与实例终态不是同一事务。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/notification/WorkflowTerminalNotificationOutboxMapper.java` — 通知 Outbox 有 DISPATCHING CAS，未见保留清理。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java` — 用户取消会持久化 CANCELLED、标记快照并通知 Task Service，但没有创建终态通知 Outbox。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/MybatisRuntimeSnapshotRepository.java` — 快照保存使用 fencing token，持续恢复查询存在；终态查询固定按最早记录分页且没有对账标记。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeSnapshotMapper.java` — claimForLease 与 updateIfOwned 防止旧副本覆盖新副本；取消状态受保护。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeProperties.java` — 恢复默认 2 分钟 stale、10 秒扫描、WAITING 超时 30 分钟、Redis 锁 60 秒。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java` — Redis 锁续租、fencing 快照、取消探针、并行 DAG 与恢复执行已实现。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/MybatisRuntimeEventStore.java` — 运行事件使用数据库原子幂等插入并支持游标增量查询。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeEventMapper.java` — `ON DUPLICATE KEY` 幂等写和批量过期删除 SQL。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/RuntimeEventRetentionJob.java` — 30 天保留，每小时单批最多删除 1000 条。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java` — SSE 心跳、游标、每轮 500 条和工作流级缓存存在；每连接仍按秒调度且无显式连接上限。
- `backend/task-service/src/main/java/com/aetherflow/task/service/RetryManager.java` — 重试次数只写入内存 Task 对象，状态 CAS 并未持久化 retry_count。
- `backend/task-service/src/main/java/com/aetherflow/task/service/TimeoutChecker.java` — 多副本超时扫描依靠 TaskStateService CAS 抢占。
- `backend/task-service/src/main/java/com/aetherflow/task/service/TaskStateService.java` — 状态更新已使用数据库 CAS，Redis 仅作可降级缓存。
- `backend/task-service/src/main/java/com/aetherflow/task/mapper/TaskMapper.java` — CAS SQL 没有更新 retry_count，确认最大重试计数存在持久化缺口。
- `backend/task-service/src/main/java/com/aetherflow/task/queue/TaskQueueConsumer.java` — dispatch 消费使用 CAS，发布 worker 后再转 DISPATCHED，异常交给 RetryManager。
- `backend/task-service/src/main/java/com/aetherflow/task/service/impl/TaskDispatchServiceImpl.java` — 任务创建有幂等键、事务后发布和补偿；重试计数缺口会影响发布失败恢复。
- `backend/ai-service/src/main/java/com/aetherflow/ai/service/AiTaskListener.java` — Rabbit listener 并发区间 2–6 已生效，租约忙时延迟重投。
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiJobLeaseService.java` — AI Job 用户范围幂等、租约、attempt 和陈旧任务接管已实现。
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiJobLeaseHeartbeat.java` — AI 执行期间持续续约并在失去所有权后 fail-closed。
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiTaskProcessingServiceImpl.java` — 模型执行、制品登记和终态持久化均检查租约；取消只在执行前探测，不能中断已开始的外部调用。
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskTerminalCoordinator.java` — AI Job 终态与事件 Outbox 由持久化服务协调，随后立即尝试发布。
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java` — 发布器可接管 2 分钟陈旧 PROCESSING，但完成/失败用无条件 updateById，缺少发布所有权 token。
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxMapper.java` — 抢占只有状态 CAS，没有 lease token/fencing。
- `summary/full-dimension-production-audit-runtime-reliability.md` — 本轮新建运行可靠性阶段摘要。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/UploadNodeExecutor.java` — 按上下文 userId 调内部文件接口校验归属并输出 fileId/fileUrl/objectKey 等下游变量。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/FfmpegWorkflowNodeExecutor.java` — 独立 FFmpeg 节点要求 fileUrl，并通过 AI 异步链路执行媒体转换。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/WhisperNodeExecutor.java` — 支持 fileUrl 或 tenant-scoped fileId 解析，缺失输入只在运行时失败。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/AiWorkflowNodeResultAdapter.java` — 已把 FFmpeg media 与 Whisper SRT 的文件 ID/URL/objectKey 映射为稳定工作流变量，旧闭环缺口已修复。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/FfmpegNodeExecutor.java` — Python 媒体结果转换为 MEDIA artifact，交统一制品登记链路。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/AsrNodeExecutor.java` — 转写文本与 SRT 内容由 AI artifact 链路统一持久化。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/AiNodeResult.java` — 根据 artifact 类型和 committed 文件元数据生成 srt/media 文件变量。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java` — 内容哈希确定对象键、元数据幂等键与失败删除已实现；崩溃发生在上传和元数据登记之间仍会留下无 DB 记录的对象。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ImageArtifactStorage.java` — 同步/异步图像结果使用内容哈希和租户元数据登记，登记失败时删除对象；同样存在进程崩溃孤儿窗口。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/OCRNodeExecutor.java` — 下载前校验 tenant 所有权和 25 MiB 限制，异步线程池有超时。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutor.java` — 仅承诺 Ollama，分片、超时和外部向量存储写入存在；缺失文本在运行时才失败。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/KnowledgeRetrievalNodeExecutor.java` — datasetId/topK/outputVariable/metadataFilter 与服务端契约一致，query 缺失运行时失败。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/config/EmbeddingProperties.java` — 默认 qdrant，但 Java 类默认仍允许内存；prod profile/Compose 显式禁用内存并要求 Qdrant。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/document/DocumentFormatPolicy.java` — Office、邮件、EPUB、PDF、文本及图片格式目录集中维护。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/document/DocumentContentExtractionService.java` — 图片直接 Tesseract，文档先 Tika、空文本再 OCR；文件大小和格式前置校验。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java` — ready 数据集/文档/非 parent 分片、owner 过滤、parent 上下文、metadata JSON、幂等创建和外部 Qdrant 优先均已实现；Qdrant 不可用时非生产配置可全量分页回退。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/vector/QdrantKnowledgeVectorIndex.java` — Qdrant payload 含 dataset/document/parent/status/metadata，搜索带 dataset 与 metadata filter。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/DefaultImageWorkflowNodeResultFinisher.java` — 默认异步图像结果会在恢复 DAG 前落 MinIO/文件元数据，不再把 base64 写入运行快照变量。
- `backend/file-service/src/main/java/com/aetherflow/file/controller/InternalFileController.java` — 内部元数据/制品接口要求短期服务 token，读取/下载额外要求用户 ID。
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java` — AI 制品有 UPLOADING/STAGED/AVAILABLE、claim token、producer fence、批量提交/中止；普通 metadata 路径要求 userId。
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/GeneratedArtifactRecoveryJob.java` — 每分钟只恢复陈旧 UPLOADING 制品。
- `backend/file-service/src/main/java/com/aetherflow/file/mapper/FileInfoMapper.java` — 已存在 STAGED 过期 SQL，但当前主代码未调用，陈旧 STAGED 制品没有自动清理。
- `backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiProviderController.java` — 已增加用户级 Provider 策略接口，并保留平台级运维接口。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/RedisProviderRoutingPolicyRepository.java` — 用户策略按 userId Redis key 隔离并回退平台默认。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicyService.java` — 文本与图像 Provider 候选均读取用户策略。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRouter.java` — 用户级 priority、timeout、retry、circuit、failover 和事件记录已进入真实调用路径。
- `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageProviderRegistry.java` — 只返回真实注册且健康的图像 Provider。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/ImageGenerationAiNodeExecutor.java` — 图像生成已按用户策略顺序 failover，但图片以 base64 output 进入 AI 终态 Outbox/回调后才由 Workflow Service 落盘。
- `backend/gateway-service/src/main/java/com/aetherflow/gateway/filter/JwtAuthenticationFilter.java` — 网关清除伪造身份头并校验 JWT/黑名单；管理员路径模式把整个 `/ai/provider/**` 都限制为 ADMIN/OWNER。
- `frontend/src/router/index.ts` — Models、Monitor、Settings 等页面允许普通 operator 访问，和网关对 `/ai/provider/**` 的管理员限制冲突。
- `frontend/src/api/modules/ai.ts` — 模型页已调用用户级 policy endpoint，但请求仍会被网关的广泛管理员规则阻断。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/project/controller/ProjectWorkspaceController.java` — 项目/工作区 CRUD API 存在。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/project/service/impl/ProjectWorkspaceServiceImpl.java` — 项目和工作区严格按 ownerUserId 隔离，但没有成员共享或租户 ACL。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/NotifyNodeExecutor.java` — 显式拒绝把通知发送给非认证用户 ID，跨用户骚扰缺口已修复。
- `backend/notify-service/src/main/java/com/aetherflow/notify/controller/NotifyController.java` — SSE token 绑定 userId，历史查询使用 Gateway userId，内部发送使用 HMAC 服务 token。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationListener.java` — RabbitMQ 通知消费进入持久通知服务。
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java` — 成员记录按操作者 ownerUserId 隔离，却会按邮箱直接同步全局 User.role；成员关系未关联 Workflow Service 的工作区。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/security/AuthenticatedUserInterceptor.java` — Workflow Service 将 Gateway 身份头绑定到请求线程并在完成后清理。
- `frontend/nginx/nginx.conf` — HTTP 入口具备 CSP、安全头、限流、实时 token 日志脱敏和内部 Gateway 代理。
- `frontend/nginx/nginx.tls.conf` — TLS 1.2/1.3、HSTS 与 HTTP 跳转存在，但必须显式使用 TLS 覆盖。
- `docker-compose.tls.yml` — TLS 证书目录为必填，未配置时 Compose fail-closed。
- `docker-compose.ha.yml` — 仅声明无状态服务双副本，保留基础 Compose 的固定 container_name；不作为实际 Swarm 生产路径。
- `docker-stack.yml` — 提供 Swarm 双/三副本、TLS secret 和外部状态服务端点；未包含监控告警服务，依赖外部运维平面。
- `deploy/observability/prometheus.yml` — 私有抓取 Java 服务 Prometheus 指标。
- `deploy/observability/alerts.yml` — HTTP 5xx、服务下线、Hikari 和队列背压告警规则存在。
- `deploy/observability/alertmanager.yml` — 只有命名 receiver，没有任何 webhook/邮件等实际通知集成，告警不会送达值班渠道。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/ingestion/url/UrlIngestionServiceImpl.java` — URL 抓取拒绝重定向和已解析私网地址，限制响应与文本大小；仍有 DNS 二次解析窗口。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/store/VectorStoreConfigService.java` — Qdrant 管理配置拒绝所有私网地址，无法直接接入典型 VPC/容器内私有 Qdrant。
- `python-ai-service/app/main.py` — Runtime API key、并发闸门与错误脱敏存在；Provider 配置写进程环境和本地明文 `.env.runtime`，多副本/重建不一致；Anthropic preset 默认 URL 与 OpenAI-compatible 调用不匹配。
- `summary/full-dimension-production-audit-tenancy-security.md` — 本轮新建多租户与安全阶段摘要。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/SseEmitterRegistry.java` — SSE 具备全局/每用户连接上限、心跳、有界发送线程池和每连接顺序队列。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationWebSocketHandler.java` — WS 有连接上限，但发送在调用线程同步执行，没有每会话串行队列、发送缓冲上限或慢客户端隔离。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/RedisNotificationFanout.java` — 多副本通过 Redis Pub/Sub fanout；持久历史由 MySQL 提供。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/impl/NotificationServiceImpl.java` — 通知记录以 eventId 唯一，事务提交后再 fanout，并支持 ID 游标历史补偿。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenService.java` — 60 秒用户绑定流 token，独立 issuer/role。
- `frontend/src/pages/monitor/MonitorPage.vue` — 治理卡大多正确用 `--` 表示未知，但缺失 Provider error rate 默认显示 0%，无事件默认显示“没有失败”。
- `frontend/src/pages/projects/ProjectsPage.vue` — 项目/工作流创建入口存在；错误状态显示原始 HTTP 文本和零值统计，缺少与 Knowledge 一致的重试体验。
- `frontend/src/config/runtimeEnv.ts` — Mock、SSE/WS fallback 与超时由构建环境控制，Mock 默认 false。
- `frontend/scripts/check-production-safety.mjs` — 通过字符串断言约束生产默认、Secret、RabbitMQ、Qdrant、代码隔离和告警转发；未检查 Alertmanager 是否有实际通知集成。
- `frontend/src/services/realtime/sseClient.ts` — SSE 有游标、心跳超时、抖动指数退避，但默认无限重连且最大间隔 10 秒。
- `frontend/src/services/realtime/notificationSocket.ts` — WS fallback 最多重连 5 次。
- `frontend/src/services/realtime/realtimeClient.ts` — SSE 失败两次后并行启用 WS fallback；开发 Mock 可生成完整虚构运行事件。
- `summary/full-dimension-production-audit-frontend-ux.md` — 本轮新建前端 UX 阶段摘要，包含浏览器实测结果。
- `performance-test/README.md` — 明确区分门禁自测、Mock JMeter 契约与真实运行；核心基线不包含 AI/GPU。
- `performance-test/aetherflow-core-api.jmx` — 覆盖注册/登录、文件和轻量工作流，未覆盖真实 Whisper/FFmpeg/LLM/图像与故障注入。
- `scripts/aetherflow-run-performance.ps1` — 生成独立 JTL/HTML/摘要并做错误率/P95/P99 门禁；浸泡时仍使用同一核心 JMX。
- `scripts/aetherflow-capacity-gate.ps1` — 单次恒定并发浸泡并写参数证据，不采集主机/池/队列同期指标，也没有阶梯和峰值阶段。
- `scripts/aetherflow-verify-deployment.ps1` — ConfigOnly 只校验基础 Compose 服务集合；运行模式检查容器/健康/HTTP，可选双用户轻量烟测，不验证 TLS/HA/告警接收器。
- `scripts/aetherflow-backup.ps1` — 备份 MySQL/Redis/MinIO 并写 hash manifest，但不加密且不是跨存储一致性快照。
- `scripts/aetherflow-restore.ps1` — 有显式破坏性确认和 hash 校验，未覆盖 RabbitMQ/Nacos/Qdrant/Provider 配置。
- `docs/production-ha-runbook.md` — 正确声明真实容量、故障演练、外部 HA 和告警接收器是发布前置条件，但仓库没有对应新鲜证据。
- `docker/java-service.Dockerfile` — 非 root、工作流镜像含中英文 Tesseract；没有 HEALTHCHECK。
- `python-ai-service/Dockerfile` — 非 root、FFmpeg/Whisper/LLM 依赖存在；没有 HEALTHCHECK。
- `.github/workflows/ci.yml` — Java 跑测试；前端只构建；Python 吞掉依赖安装失败且不跑测试。
- `summary/full-dimension-production-audit-deployment-capacity.md` — 本轮新建部署、容量与反过度工程摘要。
- `backend/task-service/src/test/java/com/aetherflow/task/service/RetryManagerTest.java` — 只验证内存 retryCount 和 mark 调用，没有覆盖数据库 retry_count 或跨扫描 DLQ。
- `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryServiceTest.java` — 覆盖 RUNNING/RETRYING 恢复，不覆盖终态分页饥饿与通知补偿。
- `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/notification/WorkflowTerminalNotificationOutboxServiceTest.java` — 覆盖 enqueue/claim/dispatch，不覆盖实例终态与 Outbox 原子性。
- `backend/ai-service/src/test/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisherTest.java` — 测试直接期望无条件 updateById，没有覆盖陈旧发布者接管竞态。
- `docker/rabbitmq/definitions.json` — Workflow AI Result Queue 为 quorum；AI 主队列、调度、通知和 DLQ 仍是普通 durable queue。
- `backend/task-service/src/main/java/com/aetherflow/task/config/RabbitMqConfig.java` — AI/调度/DLQ 未声明 quorum。
- `backend/ai-service/src/main/java/com/aetherflow/ai/config/AiRabbitConfig.java` — AI 主队列和延迟重试队列未声明 quorum。
- `backend/notify-service/src/main/java/com/aetherflow/notify/config/NotifyRabbitConfig.java` — 通知队列未声明 quorum。
- `docs/audits/2026-09-01-full-dimension-production-audit.md` — 本轮最终审计报告，包含需求矩阵、P0-P3、验证证据、整改路线和复杂度复盘。

## 当前进度
审计完成，核心可靠性/安全/并发/前端失败态/部署门禁修复已落地，全量回归与配置门禁通过。

### 最新现场验证（2026-09-02）

- Docker Desktop 已恢复；本机 Compose 25 个服务已启动，关键业务容器全部 healthy，Nginx、网关和统一健康入口通过真实请求。
- Maven 全量、前端测试/构建、Python 两个服务测试、Ruff、pip check、性能 self-test、JMeter 契约门禁均通过。
- RabbitMQ 管理 API、Workflow Redis/快照恢复、Prometheus/Grafana/Jaeger 入口已完成本机运行验证。
- 远程 `192.168.101.68` 不属于本机运行前置条件；远程 SSH/HTTP 验收因主机不可达仍未执行。
- 标准 Docker 全量重建仍需稳定 Maven/APT 制品代理；当前本机运行镜像使用已验证依赖层同步最新源码。
- 尚未形成真实 AI Provider/Ollama、Qdrant、端到端媒体链路、双租户对抗、持续容量压测、故障注入/恢复、备份恢复和安全扫描证据。

## 下一步
若需要宣布正式投产，下一步只剩真实 AI/向量依赖接入、双租户对抗测试、持续容量压测、故障注入/恢复、备份恢复、镜像/依赖安全扫描，以及稳定制品代理下的可复现 Docker 构建。

## 修复实施（2026-09-01）

- 任务重试状态迁移把 `retry_count` 纳入数据库 CAS 更新，避免多副本持续故障绕过最大重试次数。
- AI 事件 Outbox 增加 `lease_token` 抢占、持有者条件发布/重试更新，并补充 MySQL 迁移与回归测试。
- 终态快照对账改为只扫描仍缺实例终态或通知 Outbox 的记录；运行时失败/取消/恢复路径统一补建终态通知。
- 工作流定义更新增加版本条件写入；前端保存携带版本与创建幂等键，启动携带操作幂等键，冲突返回可识别错误。
- Settings 成员角色不再修改全局 `User.role`，消除按邮箱跨租户提升全局权限的路径；已有所有者过滤保持不变。
- Gateway 仅限制平台级 Provider 管理接口；用户级策略、目录和状态不再被管理员通配规则误拦截。Models 页面仅向管理员显示全局恢复/切换控制。
- 节点目录校验补充 Upload/FFmpeg/OCR/Whisper/LLM/Summary/Embedding/Code 的输入契约；Code/OCR/Embedding 能力按服务端运行时快照反馈，Code 未启用时保存前即 fail-closed。
- 陈旧 `STAGED` 生成制品纳入回收，保留无引用对象清理；Qdrant 私网地址仅在显式 `WORKFLOW_QDRANT_ALLOW_PRIVATE_NETWORKS=true` 时允许。
- Python Provider 运行时配置增加 Redis 共享持久化与 5 秒刷新，Compose/Swarm 注入受密码保护的 Redis 连接；多副本不再依赖本地 `.env.runtime`。
- 前端补充 Mock 模式全局标识、项目错误重试、Monitor 未知指标不伪报 0、密码变更强制重新登录、工作流项目加载异常收敛、定义/运行幂等键。
- CI 增加前端单测/契约检查/npm audit、Python pytest/pip check；默认 Compose 移除未被业务消费的 Elasticsearch/Kibana；Java 镜像加入非 root Actuator healthcheck；Swarm 增加资源配额；RabbitMQ 业务队列统一 quorum（迁移步骤见 `docs/operations/rabbitmq-quorum-queue-migration.md`）。
- Alertmanager 在生产环境要求 `ALERTMANAGER_WEBHOOK_URL`，启动时注入真实接收器；缺失时故意启动失败而不是假装告警已送达。
- WebSocket 发送改用有界缓冲和发送超时装饰器，慢客户端会被隔离关闭，发送参数可由环境配置。
- 图像生成/放大结果在 AI Service 侧先登记为受限 artifact，Outbox/RabbitMQ 只传文件元数据；Workflow Service 对已登记 artifact 不再重复解码/上传。

## 修复后验证证据

- Maven 根聚合全量回归：206 份报告、730 项测试，0 failure/error/skip，BUILD SUCCESS。
- 前端 `npm test -- --run`：46 个文件、166 项通过；`npm run build` 通过。
- Python AI Service `.venv`：22 项通过，`ruff`、`pip check` 通过；AI Runtime 4 项与 `pip check` 通过。
- Compose ConfigOnly 在临时强配置下展开 24 个服务通过；Docker daemon 当前不可用，因此真实容器健康、Swarm rollout、AI/媒体压测与故障演练仍属于发布前置验证项。

## 发现的关键信息
- 项目根目录存在多份旧审计进度文件；用户已明确要求本次作为新任务，故不沿用旧任务状态。
- 最新 Summary 指向多租户 ACL、工作流幂等与快照并发、RabbitMQ 拓扑、artifact 一致性、通知背压、前端契约检查和真实性能证据等高风险审计方向，均需基于当前工作树重新验证。
- 两份 Summary 的部分历史结论互相存在版本差异，例如启动 Outbox 已由 P0 缺陷演变为“唯一启动 Outbox + 抢占派发”契约；本轮不能复制旧报告，必须以当前代码和新鲜验证为准。
- 早期审计中“FFmpeg、工作流复制、资料维护、字幕 artifact、AI 任务租约”等多项缺口后来已有实现或加固迹象，说明本轮必须同时检查功能是否存在、闭环是否完整以及新实现是否引入新的复杂度或回归。
- 开题报告明确要求复制与预设模板、保存或执行前配置缺失校验、取消终态、统一保存全部中间/输出制品、无需刷新实时状态、按用户配置 Provider 降级以及真实压力测试；这些不能用“存在相近类或接口”替代端到端闭环。
- 当前 Git 分支为 `graduation/chyinan-maintenance`，审计开始时除本轮新增进度、Summary 与渲染产物外没有其他未提交改动。
- 仓库同时存在单机 Compose、HA/TLS 覆盖、Prometheus/Alertmanager、备份恢复和 V1–V23 迁移；这些属于候选证据，必须继续验证是否接入默认部署、是否可运行以及是否覆盖主业务链路。
- 认证主功能基本闭环，但资料修改存在会话一致性与体验问题：改用户名后当前 JWT 的 `username` Claim 仍旧；改密码后前端清空会话却仍停留在账号页并显示普通保存成功，没有显式“密码已变更，请重新登录”闭环。
- 工作流复制和预设模板已形成前后端真实入口，旧审计中“仅有 API、页面未接入”的结论已过时。
- 定义创建和运行启动虽支持服务端幂等键，当前正式前端不生成/发送该字段；用户点击后遇到超时、代理重试或浏览器重复提交时仍可能创建重复定义或实例。
- 多数节点目录把关键输入源标为可选，服务端跨字段校验只覆盖知识检索和图像 prompt；例如 FFmpeg/Whisper/OCR/Embedding/LLM/Summary 可在没有固定输入也没有变量输入时保存，部分配置会到运行阶段才失败，尚未达到“保存/更新时按目录阻断不可执行配置”的完整语义。
- 工作流定义更新使用普通 `updateById`，版本号仅在内存加一，没有数据库条件更新或 ETag；多标签页/并发编辑会静默最后写入覆盖，版本字段不能防止丢失更新。
- Task Service 的 `retry_count` 没有随重试状态迁移持久化，持续故障可能绕过 `maxRetries` 并无限重试，这是当前最高优先级正确性风险之一。
- 终态快照对账会被最早的已对账记录长期占据固定 LIMIT，且不补建终态通知；取消接口也不入通知 Outbox，终态通知闭环不完整。
- AI Job 租约/fencing 已完整，但 AI 事件 Outbox 的 PROCESSING 抢占没有所有权 token，旧发布者可覆盖接管者状态。
- FFmpeg→Whisper 及 Whisper SRT 文件变量闭环已完整，旧审计相关缺口已修复。
- 普通用户的 Provider 页面和“用户级策略”后端实现被 Gateway `/ai/provider/**` 的管理员通配规则整体拦截；前端却允许 operator 进入 Models 页面，形成确定的 403 功能/体验缺陷。
- 异步图像生成最终会落文件服务，但在此之前最多 8 张、单张上限 20 MiB 的 base64 结果会穿过 AI Job output、Outbox 和 RabbitMQ 回调，存在超大数据库行/消息和队列阻塞风险，且违背大文件用标识传递的设计目标。
- 文件服务只回收陈旧 UPLOADING 制品，已提供但未调用 STAGED 过期 SQL；回调永久失败或输出内容变更时可能长期积累不可见 STAGED 对象。
- 核心数据目前是用户级隔离而非一等租户 ACL；Settings 成员不参与工作区资源授权，并可按邮箱修改全局角色，多租户开放时存在跨租户权限提升风险。
- Python Provider 配置是单副本本地明文状态，Swarm 两副本下会配置漂移且重建丢失；不满足持久配置和 Secret 生命周期要求。
- Alertmanager receiver 没有任何实际通知集成，Prometheus 告警即使触发也不会形成值班闭环。
- 通知 SSE 的连接治理和历史补偿已完善；WebSocket 作为备用通道仍同步遍历并直接写 session，慢连接或并发写可能阻塞/关闭连接，缺少每会话背压与串行发送保护。
- 本地浏览器实测确认 WorkflowPage 在项目 API 失败时产生未处理 mounted hook 异常；页面仍半渲染。
- 默认关闭的 Code Runtime、依赖 AI Runtime 的 FFmpeg，以及 Embedding/OCR 等本地能力没有完整前端可用性反馈，用户可保存后到启动/运行阶段才失败。
- Monitor 把未知错误率渲染为 0% 并显示“没有失败”，属于运维误导；Mock 回退页面缺少统一醒目来源标识。
- 当前容量门禁没有真实 AI/媒体、峰值/阶梯、依赖故障与资源指标证据；本地最新 JTL 仍是 2026 年 6 月。
- Swarm Java/Python 服务缺少 healthcheck 和多数资源限制；Alertmanager 没有实际通知集成；CI 未执行前端/Python测试。
- Elasticsearch/Kibana 无任何消费链路，Seata 主业务无远程事务参与者，是当前最明确的默认部署臃肿项。
- 新鲜验证：Java 718 项、前端 166 项、Python 21+4 项通过；前端 build 和所有 check 通过；npm audit 0 漏洞；性能 self-test/JMeter 契约通过；隔离强配置 Compose 展开 26 服务通过。
- 当前 Docker daemon 不可连接，未完成真实容器健康、AI/媒体容量、故障注入或恢复演练；当前根 `.env` 缺少 CODE_RUNTIME_API_KEY，被 ConfigOnly 正确阻断。
