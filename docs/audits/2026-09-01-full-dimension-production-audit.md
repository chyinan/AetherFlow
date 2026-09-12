# AetherFlow 开题报告与投产能力全维度审计

> 审计日期：2026-09-01  
> 审计对象：`graduation/chyinan-maintenance` 当前工作树  
> 文档基线：`C:\Users\chyinan\Downloads\陈胤安 广州工商学院本科毕业论文（设计）开题报告  (1).docx`  
> 审计方式：DOCX 16 页逐页核验、源码与配置追踪、本地浏览器巡检、全量测试、专项契约、性能契约和 Compose 配置检查。  
> 本轮边界：只审计，不修改业务代码、依赖或部署配置。

## 结论

AetherFlow 已经超过普通毕设演示项目。认证、工作流 CRUD、整个工作流复制、预设模板、Vue Flow 编排、自研 DAG Runtime、异步 AI、文件治理、知识库、SSE/WS、Provider 路由、生产配置和测试都有真实实现。

但当前不能判定为可持续稳定投产，也不能宣称已经完成多租户管理。阻断原因不是缺少更多框架，而是若干已有状态机和权限边界没有闭环：

1. Task Service 的重试次数没有持久化，持续故障可能绕过最大重试次数并无限重试。
2. 工作区成员不是资源 ACL，却能按邮箱修改全局用户角色；多租户开放后会形成跨租户权限提升。
3. 工作流终态对账可能被历史快照饿死，且不能补建终态通知 Outbox。
4. AI 回调 Outbox 没有发布所有权 token，超时接管后旧发布者仍能覆盖状态。
5. 普通用户 Provider 策略接口被 Gateway 的管理员通配规则阻断。
6. 生产容量、故障恢复、灾备和告警送达没有新鲜真实证据。

**投产判定：blocked。** 可以继续用于开发、功能验收和受控演示；在 P0/P1 正确性问题修复并完成真实部署验证前，不应承载多客户生产数据或对外承诺高并发、高可用。

## 严重程度

- `P0`：会造成权限突破、无限副作用、不可控资源放大或核心数据错误；必须先修。
- `P1`：阻断生产发布或使明确产品承诺无法闭环。
- `P2`：不会立即破坏核心数据，但会降低可维护性、用户体验或长期稳定性。
- `P3`：文案、结构或局部一致性问题，可随常规迭代处理。

## 开题报告实现矩阵

| 契约 | 判定 | 当前实现与边界 |
| --- | --- | --- |
| `DOC-ARCH-01` 微服务职责拆分 | 已实现 | 9 个 Maven 模块，7 个可运行 Java 服务，Vue 前端和 Python Runtime。 |
| `DOC-ARCH-02` Nacos/Gateway/OpenFeign/Sentinel/Seata | 部分实现 | 前四项进入主链路；Seata 主业务事务没有远程参与者，实际一致性依赖本地事务和 Outbox。 |
| `DOC-ARCH-03` MySQL/Redis/RabbitMQ/MinIO/Docker/Nginx | 已实现但未证明生产 | 单机 Compose 齐全，Swarm 使用外部状态服务；真实 HA、故障切换和容量没有证据。 |
| `DOC-ARCH-04` 低耦合扩展节点 | 基本实现 | NodeRegistry、目录、DTO 和执行器分层存在；部分节点能力反馈和配置校验仍分散。 |
| `DOC-AUTH-01` 注册/登录/OAuth/资料/登出 | 已实现 | 后端和页面闭环；密码修改后的重登录反馈不清晰。 |
| `DOC-AUTH-02` 统一访问控制 | 用户级已实现，多租户未实现 | Gateway JWT、黑名单、角色和服务内 owner 过滤存在；没有一等 tenant/ACL。 |
| `DOC-WF-01` CRUD/复制/预设模板 | 已实现 | 后端接口和编辑器按钮都已接入，旧审计结论已过时。 |
| `DOC-WF-02` DAG 拖拽/连线 | 已实现 | Vue Flow、mapper、DAG 校验、分支路由和撤销/重做存在。 |
| `DOC-WF-03` 保存/执行前完整校验 | 部分实现 | 循环、连接、节点类型、目录类型/枚举已校验；多数节点缺少“固定输入或变量输入至少一个”的可执行性校验。 |
| `DOC-WF-04` DAG 推进与状态记录 | 基本实现 | 并行 DAG、事件、快照、锁、fencing 和恢复存在；终态对账与通知有缺陷。 |
| `DOC-NODE-01` 文件输入 | 已实现 | tenant-scoped fileId 解析并输出 fileUrl/objectKey。 |
| `DOC-NODE-02` 独立 FFmpeg | 已实现 | AI/Python 媒体转换、MEDIA artifact 和下游通用文件变量已闭环。 |
| `DOC-NODE-03` Whisper 与时间信息 | 已实现 | 转写、SRT artifact、srtFileId/srtUrl/srtObjectKey 已闭环；真实模型验收未执行。 |
| `DOC-NODE-04` OpenAI/Ollama 文本能力 | 代码已实现，运行未证明 | 生成/总结/翻译和用户路由存在；普通用户策略页面被 Gateway 拦截。 |
| `DOC-NODE-05` OCR | 代码与测试已实现 | Tika + Tesseract 自动回退、25 MiB/100 万字符契约存在；未用真实生产文件验收。 |
| `DOC-NODE-06` Embedding/知识库/RAG | 基本实现 | Ollama、Qdrant、ready 过滤、parent-child、metadata filter 和分页语义回退存在；私网 Qdrant 配置被拒绝。 |
| `DOC-NODE-07` SD WebUI/ComfyUI | 代码已实现，运行未证明 | 健康 Provider 目录、用户级图像优先级和 failover 存在；base64 回调过大风险未解决。 |
| `DOC-NODE-08` 输出查看/下载 | 部分实现 | END 只整理变量，下载需要 EXPORT/图像保存；不是单一“输出节点自动生成文件”的语义。 |
| `DOC-NODE-09` 统一节点结构 | 基本实现 | 统一 DTO、目录、输入/输出变量和执行器接口存在。 |
| `DOC-RUN-01` 长任务异步解耦 | 已实现 | Task/RabbitMQ/AI Job/Workflow WAITING 回调闭环存在。 |
| `DOC-RUN-02` 状态/超时/重试/失败 | 部分实现 | CAS、超时和 DLQ 存在；Task retry_count 持久化缺陷破坏最大重试。 |
| `DOC-RUN-03` 成功/失败/取消终态 | 基本实现 | 用户取消 API 和 Task 传播存在；外部模型调用不能强制中断，取消通知缺失。 |
| `DOC-RUN-04` 运行记录 | 已实现 | 开始时间、当前节点、进度、节点结果、异常和日志页面齐全。 |
| `DOC-RUN-05` 异常恢复 | 代码部分实现，未证明 | 启动/持续恢复、WAITING watchdog、锁续租存在；无真实故障演练，且终态对账会饿死。 |
| `DOC-FILE-01/02` 文件 CRUD 与元数据 | 已实现 | 上传、分片、下载、删除、分类、配额、MinIO 和用户归属存在。 |
| `DOC-FILE-03` 大文件只传标识 | 部分实现 | 普通文件符合；图像生成的 base64 在落盘前仍穿过 AI Job、Outbox 和 RabbitMQ。 |
| `DOC-FILE-04` 中间/输出统一管理 | 部分实现 | AI artifacts 有批量状态机；同步 Export/Image 有崩溃孤儿窗口，STAGED 没有自动过期。 |
| `DOC-RT-01/02/04` 实时状态/日志/SSE/WS | 基本实现 | 持久事件、游标、SSE 主通道、WS 备用和历史补偿存在；WS 慢连接背压不足。 |
| `DOC-RT-03` 完成/异常通知 | 部分实现 | 终态通知 Outbox 存在，但终态补偿和用户取消不补建通知。 |
| `DOC-PROVIDER-01` 用户配置优先级 | 后端实现、前端不可用 | userId Redis 策略存在；Gateway 把用户接口当管理员接口。 |
| `DOC-PROVIDER-02/03` 降级与审计 | 基本实现 | 文本和图像 failover、timeout/retry/circuit 与日志存在；配置多副本一致性不足。 |
| `DOC-TEST-01` 功能/接口测试 | 本地较完整，CI 不完整 | 本轮 Java/前端/Python通过；CI 不跑前端/Python测试。 |
| `DOC-TEST-02` 典型完整 AI 工作流 | 未证明 | 没有当前版本真实音视频、文档、知识库、图像端到端结果。 |
| `DOC-TEST-03` 高并发/队列/保护 | 未证明 | 只有核心 API/Mock 契约和轻量工作流，无真实重负载与故障注入。 |
| `DOC-UX-01` 低门槛和实时反馈 | 部分实现 | 编辑器功能完整，但能力提示、错误状态、Mock 标识和节点目录认知负担仍有问题。 |

## P0：必须先处理

### P0-1 Task 最大重试次数实际可能失效

`RetryManager` 只在 JVM 对象上执行 `task.setRetryCount(nextRetryCount)`，随后调用状态迁移。`TaskStateService` 的 CAS 最终只更新状态和 `next_retry_at`，SQL 不写 `retry_count`。

证据：

- `backend/task-service/src/main/java/com/aetherflow/task/service/RetryManager.java:97`
- `backend/task-service/src/main/java/com/aetherflow/task/service/RetryManager.java:100`
- `backend/task-service/src/main/java/com/aetherflow/task/service/TaskStateService.java:42`
- `backend/task-service/src/main/java/com/aetherflow/task/mapper/TaskMapper.java:25`

下一轮扫描从数据库读取旧计数，持续失败任务会反复计算相同 attempt，无法稳定进入 DLQ。结果是消息、外部 AI 调用和资源占用持续放大。

现有 `RetryManagerTest` 只断言内存对象变成 1，没有验证数据库计数持久化或跨扫描最大次数。

### P0-2 多租户启用后存在跨租户全局角色提升

Settings 成员记录按当前操作者 `ownerUserId` 隔离，但创建/更新成员后会按邮箱查询全局用户表并直接修改 `User.role`。

证据：

- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:102`
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:125`
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:304`
- `backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:316`

成员记录没有 tenant/workspace 外键，也不参与 Workflow/File/Knowledge 的 ACL。多租户场景中，租户 A 管理员可通过已知邮箱修改租户 B 用户的全局角色。

在真正引入组织共享前，必须先确定唯一授权模型：平台角色、租户角色和资源 ACL 不能继续复用一个全局 `User.role`。

## P1：生产发布阻断项

### P1-1 终态快照对账会被旧记录饿死

`findTerminal(limit)` 永远按最早 `updated_at` 返回固定数量终态快照。对账成功后没有删除、游标或 reconciled 标记，扫描器会反复读取同一批旧记录，新崩溃窗口中的未对账终态可能永久进不了窗口。

证据：

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/persistence/MybatisRuntimeSnapshotRepository.java:101`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java:102`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java:107`

### P1-2 终态通知 Outbox 不具备事务/补偿闭环

正常路径先更新实例终态，再单独插入通知 Outbox。进程可在两步之间崩溃。终态对账只更新实例，不补 Outbox；取消接口直接写 `CANCELLED` 和快照，也不 enqueue。

证据：

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:459`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:466`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java:111`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java:237`

### P1-3 AI 任务事件 Outbox 没有发布所有权 fencing

发布器把 2 分钟未完成的 `PROCESSING` 行视为可接管，但 claim 没有 token。旧发布者之后仍使用无条件 `updateById()` 标记成功或改回 `PENDING`，可覆盖新发布者状态。

证据：

- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java:26`
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java:56`
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java:68`
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxPublisher.java:166`
- `backend/ai-service/src/main/java/com/aetherflow/ai/outbox/AiTaskEventOutboxMapper.java:14`

### P1-4 普通用户无法使用用户级 Provider 策略

AI Service 与前端都已改用 `/policy/user`，但 Gateway 对 `/ai/provider/**` 整体要求 ADMIN/OWNER。Router 又允许 operator 进入 Models。

证据：

- `backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiProviderController.java:87`
- `backend/gateway-service/src/main/java/com/aetherflow/gateway/filter/JwtAuthenticationFilter.java:111`
- `backend/gateway-service/src/main/java/com/aetherflow/gateway/filter/JwtAuthenticationFilter.java:112`
- `frontend/src/api/modules/ai.ts:202`
- `frontend/src/router/index.ts:98`

### P1-5 Provider 配置在多副本下漂移并以明文落容器

Python Runtime 更新配置时修改当前进程环境，并把 API key 写入本地 `.env.runtime`。Swarm 有两个 Python 副本，但没有共享持久化、配置广播或 Secret 管理；更新只影响命中的副本，重建还会丢失。

证据：

- `python-ai-service/app/main.py:1059`
- `python-ai-service/app/main.py:1175`
- `python-ai-service/app/main.py:1182`
- `docker-stack.yml:190`

### P1-6 工作流正式前端没有使用已有幂等契约

后端定义创建和实例启动支持操作级幂等键，前端保存与启动没有生成或发送。网络超时、代理重试和快速重复点击仍可能产生重复定义/运行。

证据：

- `frontend/src/api/mappers/workflowMapper.ts:799`
- `frontend/src/services/api/workflowApi.ts:602`
- `frontend/src/services/api/workflowApi.ts:641`
- `frontend/src/services/api/workflowApi.ts:642`

定义更新也没有 `version` 条件更新或 ETag，多标签页会静默最后写入覆盖。

### P1-7 保存校验与运行可执行性之间仍有缺口

目录校验支持 required/type/enum，但 FFmpeg、Whisper、OCR、Embedding、LLM、Summary 等输入通常全部标为非必填，也没有统一的跨字段“固定输入或变量输入至少一个”规则。用户可保存不可执行图，到运行阶段才失败。

同样，Code 默认关闭但前端仍显示可用；FFmpeg、Embedding、OCR 的本地/外部能力未进入统一能力反馈。

### P1-8 工作流页面初始化失败产生未处理异常

项目列表请求失败时，`loadRouteWorkflow()` 直接等待 rejected `projectReady`。外层只有 `finally`，没有错误收口。浏览器实测出现 Vue `Unhandled error during execution of mounted hook`。

证据：

- `frontend/src/pages/workflows/WorkflowPage.vue:148`
- `frontend/src/pages/workflows/WorkflowPage.vue:153`
- `frontend/src/pages/workflows/WorkflowPage.vue:243`
- `frontend/src/pages/workflows/WorkflowPage.vue:258`

### P1-9 Monitor 把未知状态显示成健康

Provider error rate 缺失时默认 `0%`；没有事件时显示“没有观察到失败”，不区分采集失败与真实零错误。

证据：

- `frontend/src/pages/monitor/MonitorPage.vue:20`
- `frontend/src/pages/monitor/MonitorPage.vue:28`
- `frontend/src/pages/monitor/MonitorPage.vue:65`

### P1-10 图像回调仍传输大体积 base64

异步图像最终会在 Workflow Service 落文件服务，但落盘前最多 8 张、单张上限 20 MiB 的 base64 会进入 AI Job output、Outbox payload 和 RabbitMQ 回调。它可能产生超大 MySQL 行和队列消息，阻塞消费者；也违背“大文件在服务间只传标识”的目标。

### P1-11 陈旧 STAGED 制品没有自动回收

文件服务恢复任务只查 UPLOADING。Mapper 虽有 `expireStagedGeneratedArtifact()`，主代码没有调用。回调永久失败、Outbox 损坏或模型重试内容变化时，不可见 STAGED 对象会长期存在。

证据：

- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java:517`
- `backend/file-service/src/main/java/com/aetherflow/file/mapper/FileInfoMapper.java:117`
- `backend/file-service/src/main/java/com/aetherflow/file/mapper/FileInfoMapper.java:179`

### P1-12 私有 Qdrant 被配置校验拒绝

Qdrant 管理接口无条件拒绝 loopback/link-local/site-local 地址，没有运维 allow-list。典型 VPC 或容器私有 Qdrant 无法配置，只能暴露为公网可解析地址。

证据：

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/store/VectorStoreConfigService.java:179`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/store/VectorStoreConfigService.java:200`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/store/VectorStoreConfigService.java:206`

### P1-13 告警、CI、发布健康和容量证据不完整

- Alertmanager receiver 没有任何 webhook/邮件集成。
- Swarm 中 Java/Python 镜像无 healthcheck，stack 也未定义 readiness 和多数资源限制。
- CI 前端只 build；Python 依赖安装失败被 `|| true` 吞掉且不跑 pytest。
- 容量脚本只执行轻量核心 JMX，证据 JSON 不采集同期主机、连接池和队列指标。
- 当前没有真实 AI/媒体、阶梯、峰值、故障注入、恢复演练或 RPO/RTO 报告。

证据：

- `deploy/observability/alertmanager.yml:5`
- `.github/workflows/ci.yml:78`
- `.github/workflows/ci.yml:99`
- `performance-test/README.md:5`
- `scripts/aetherflow-capacity-gate.ps1:53`

### P1-14 生产队列并未统一使用 quorum

只有 Workflow AI Result Queue 显式 `x-queue-type=quorum`。AI 主任务、调度、通知、DLQ 和延迟重试队列均按普通 durable queue 声明，RabbitMQ 配置也没有默认 quorum。与生产运行手册不一致。

证据：

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/async/WorkflowAiResultRabbitConfig.java:26`
- `backend/task-service/src/main/java/com/aetherflow/task/config/RabbitMqConfig.java:41`
- `backend/task-service/src/main/java/com/aetherflow/task/config/RabbitMqConfig.java:49`
- `backend/notify-service/src/main/java/com/aetherflow/notify/config/NotifyRabbitConfig.java:25`

## P2：应纳入近期迭代

- 用户名修改后当前 JWT 的 username Claim 保持旧值直到刷新；密码修改后页面清空会话却只显示普通保存成功，没有明确重登录提示。
- 启动 Outbox 会周期性重新扫描已 DISPATCHED 行，且 30 分钟失联阈值硬编码；没有 Outbox/快照保留任务。
- 运行事件每小时最多清理 1000 条，长期生成速度高于清理速度时会积压。
- Runtime SSE 没有显式连接数上限；Notify WS 没有 per-session 串行发送和慢连接缓冲保护。
- Projects 错误页显示原始英文 502 和零值统计，没有重试；Knowledge 有重试，错误语义不一致。
- Mock 回退可静默展示虚构 Models/Files/Runs 健康数据，没有统一醒目的演示模式横幅。
- 节点目录约 30 项无搜索/分类过滤；FFmpeg 显示名“读取视频文件”与真实转换语义不一致。
- END 只整理变量，真正下载需要 EXPORT/SAVE；需要统一产品文案和模板引导。
- Anthropic preset 使用官方原生 URL，却通过 OpenAI-compatible `chat.completions` 调用，默认不可执行。
- 灾备脚本不加密、不是跨存储一致性快照，也不覆盖 RabbitMQ/Nacos/Qdrant/Provider 配置。

## 反过度工程审查

### 默认 Compose 中的 Elasticsearch/Kibana 没有实际用途

全仓库除 Compose 和部署清单外没有 Elasticsearch/Kibana/Logstash/Filebeat 使用。默认启动 Elasticsearch 1 GiB heap 与 Kibana只增加内存、升级、漏洞和备份面。

证据：`docker-compose.yml:198`、`docker-compose.yml:221`。

建议：在真实日志检索链路落地前移出默认 Compose，改为可选 profile。不要为了替代它再引入另一套日志平台。

### Seata 没有保护主业务跨服务写

主 `startInstance()` 标注 GlobalTransactional，但事务体只写 Workflow Service 本地表；Task/AI 调度在事务提交后异步执行。真正跨服务回滚只存在 dev demo。

证据：

- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:183`
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/demo/WorkflowSeataDemoService.java:30`

建议：若没有明确同步跨服务 ACID 用例，从默认生产依赖移除 Seata，继续使用本地事务 + Outbox/Saga。

### HA 入口应收敛为一个

`docker-compose.ha.yml` 声明 replicas，但基础 Compose 固定 `container_name`，不适合作为横向扩容路径。真实生产路径已经是 `docker-stack.yml`。

建议：把 Compose HA 覆盖明确降级为非生产演示或删除，避免维护两套冲突入口。

## 新鲜验证结果

| 验证 | 结果 |
| --- | --- |
| DOCX 渲染 | 16 页全部检查，无缺页、裁切、重叠；无批注或实际修订节点。 |
| `mvn test` | 205 个测试报告，718 项测试，0 failure/error/skip，BUILD SUCCESS。 |
| `frontend npm test` | 46 个文件、166 项测试通过。 |
| `frontend npm run build` | 生产构建通过，1941 modules transformed。 |
| Frontend `check:*` | 14 类脚本全部通过，包括 workflow mapping、production safety、notification、knowledge、model 等。 |
| `python-ai-service` | 项目 `.venv`：21 passed，1 个 TestClient 弃用警告。 |
| `ai-runtime` | 项目 `.venv`：4 passed。 |
| Python `pip check` | 两个项目均无 broken requirements。 |
| `npm audit` | 官方 registry，全量依赖 0 vulnerabilities。 |
| 性能 gate self-test | 正反例通过，能够拒绝错误率/P99 负例。 |
| JMeter 契约 | Mock Gateway，11 样本、0 错误；仅证明计划和门禁接线。 |
| Compose ConfigOnly | 当前 `.env` 因缺少 `CODE_RUNTIME_API_KEY` 被正确阻断；隔离临时强配置展开 26 个服务并通过。 |
| 真实 Docker/部署 | Docker daemon 不可连接，未运行真实容器健康、容量或故障验证。 |

测试通过不推翻审计缺陷。现有测试没有覆盖 Task retry_count 跨扫描持久化、终态对账饥饿、通知补偿、AI Outbox 接管竞态、Gateway 用户 Provider 路由或 WorkflowPage 失败初始化。

## 整改顺序

### 阶段 0：修正确性和权限边界

1. 把 `retry_count` 纳入 Task CAS 状态迁移，并增加“跨两次数据库扫描达到 DLQ”的集成测试。
2. 在支持多租户前拆分平台角色、租户角色和资源 ACL；成员变更不得直接修改无租户边界的全局角色。
3. 让实例终态与通知 Outbox 同事务提交，或建立按终态实例扫描补建 Outbox 的幂等补偿。
4. 为 AI Event Outbox 增加 claim token/lease/fencing，完成和失败更新必须校验所有权。

### 阶段 1：补齐用户闭环

1. 拆分 Gateway 权限：用户 policy endpoint 对本人开放，平台 status/config/recover/logs 保持管理员权限。
2. 前端为定义创建和运行启动生成稳定操作幂等键；更新使用乐观锁版本。
3. 把 Code、FFmpeg、Embedding、OCR、Qdrant 等能力纳入统一快照；保存阶段补“固定输入或变量输入”跨字段规则。
4. 修复 WorkflowPage 初始化错误、Monitor unknown 状态和密码重登录反馈。
5. 图像结果在 AI Service 直接进入 artifact 状态机，回调只传文件标识。

### 阶段 2：补投产底座

1. 配置真实 Alertmanager receiver；为生产镜像/stack 增加 healthcheck、readiness、资源限制和连接池预算。
2. 统一 RabbitMQ 生产队列策略并完成 quorum 迁移演练。
3. 清理 STAGED、Start Outbox、通知 Outbox、快照和事件；保留任务吞吐必须高于生成速率。
4. CI 强制运行 Java、前端测试/build/check、Python pytest、性能契约、Compose config 和依赖/Secret 扫描。
5. 将 Provider 配置迁移到持久、版本化、加密的配置/Secret 源，多副本按同一版本加载。

### 阶段 3：用真实证据解除投产阻断

1. 在隔离生产等价环境运行真实音视频、OCR、知识库、LLM、图像和大文件链路。
2. 覆盖阶梯、突发、长时间浸泡、队列扩缩、依赖超时、Rabbit/Redis/MySQL/MinIO/Provider 故障。
3. 同步采集成功率、P95/P99、队列等待、重复执行率、消息丢失率、恢复时间、CPU/GPU、堆、Hikari 和存储饱和度。
4. 演练备份恢复并形成 RPO/RTO 报告、对象校验和、消息恢复边界和回滚记录。

## 复杂度复盘

上述整改不需要新增事件总线、工作流框架或第二套编排平台。

- Task 重试复用现有 CAS SQL。
- 终态通知复用现有 Outbox 和唯一 eventId。
- AI 回调复用现有 AI Job lease 模式。
- 能力反馈复用现有 capability snapshot 和节点目录。
- 多租户只增加一套明确 tenant/membership/ACL 边界，不同时引入组织层、策略语言和通用权限引擎。
- 日志和事务组件先裁剪无收益依赖，再根据真实需求扩展。

本轮审计报告保留为 2026-09-01 修复前基线；后续修复记录见 `PROGRESS-full-dimension-production-audit.md`。

## 修复跟进（同日）

已在 `codex/industrial-production-hardening` 分支落地阶段 0/1 及部分阶段 2：Task retry_count 持久化、AI Outbox fencing、终态通知补偿、成员角色越权修复、Provider 用户路由、定义/运行幂等与乐观锁、节点 fail-closed 校验、STAGED 回收、Qdrant VPC 白名单开关、Python Provider Redis 共享配置、图像 artifact 先落文件、前端错误态与 Mock 标识、CI/Compose/Swarm/Alertmanager/Rabbit quorum 加固。修复后的全量测试与配置门禁证据以进度文件中的最新记录为准；真实 Docker、容量、故障演练仍需可用的 Docker daemon 与生产等价依赖。
