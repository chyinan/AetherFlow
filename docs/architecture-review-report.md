# AetherFlow 架构审查报告

审查范围：`D:\Programs\AetherFlow`（Spring Cloud + Spring Boot 3 + MyBatis-Plus + Activiti 7 + Vue3/TS + Python FastAPI）
审查模块：gateway / auth / workflow / task / ai / file / notify + common + workflow-runtime-api + python-ai-service + frontend
审查方式：静态通读 pom、application.yml、核心 Java/TS 源码、docker-compose、MySQL 初始化脚本

分级口径：Critical=架构性缺陷/安全可被直接利用；High=可靠性/可扩展性/可观测性主链路缺陷；Medium=设计不规范或资源浪费；Low=优化项。

---

## Critical

### C-1. Activiti 7 完全未使用却被加载并自动建表，与自定义 DAG 引擎并存
- **问题描述**：`ActivitiConfig` 注册了 `ProcessEngine` / `RepositoryService` / `RuntimeService` Bean，且 `setDatabaseSchemaUpdate(DB_SCHEMA_UPDATE_TRUE)`。但在整个 `backend` 代码库中，除该配置类外**没有任何位置注入或调用** Activiti 的 RuntimeService/RepositoryService/TaskService/ProcessEngine（grep 结果为空）。真正的工作流执行由自研 `workflow.runtime.engine.WorkflowRuntimeEngine`（DAG + NodeExecutor + 状态机 + 快照/恢复 + Redis 锁）承担，二者完全割裂。
- **影响**：① 启动时在共享库自动创建数十张 `ACT_*` 表，造成 schema 污染与漂移风险；② 引入 Activiti 全量依赖增加启动时间与攻击面；③ 误导后人对"工作流引擎"的架构判断；④ `DB_SCHEMA_UPDATE_TRUE` 在生产属高危配置。
- **涉及文件**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/config/ActivitiConfig.java`；`backend/workflow-service/pom.xml`（activiti-engine 依赖）；`pom.xml`（dependencyManagement activiti.version=7.1.0.M6）。
- **修复建议**：确认 Activiti 无业务依赖后整体移除（删配置类、删依赖、删 `ACT_*` 表）；若保留则改用 `SpringProcessEngineConfiguration` 并接入 Spring 事务，并改为 Flyway/Liquibase 管理 schema，关闭 `DB_SCHEMA_UPDATE_TRUE`。统一以自研 DAG Runtime 为唯一引擎并在文档中声明。

### C-2. 所有微服务共享单一 MySQL 数据库，服务数据边界名存实亡
- **问题描述**：`docker/mysql/init/01-aetherflow.sql` 虽 `CREATE DATABASE` 了 `aetherflow_auth / workflow / runtime / task / file / notify` 六个库，但随后 `USE aetherflow;` 将全部 24+ 业务表（`af_user`、`af_workflow_definition/instance`、`af_task_record`、`af_ai_job`、`af_file_info`、`af_knowledge_*`、`af_notification_record`、`af_workflow_runtime_snapshot/event` …）都建在 `aetherflow` 单库；六个分库仅被复制了 `undo_log`。`.env` 中 `MYSQL_DATABASE=aetherflow`，各服务默认连同一库。
- **影响**：共享数据库反模式——服务在数据层强耦合，无法独立扩展/部署/迁移 schema；某服务慢查询/锁影响全局；Seata `undo_log/global_table/branch_table/lock_table` 亦在同一库放大锁竞争；"微服务"边界在最关键的数据层失效。
- **涉及文件**：`docker/mysql/init/01-aetherflow.sql`；根 `.env`；各服务 `application.yml` 的 `spring.datasource.url`（均 `${MYSQL_DATABASE:aetherflow}`）。
- **修复建议**：将各服务表真正迁入对应分库（`af_*`→对应 `aetherflow_*`），各服务 `MYSQL_DATABASE` 指向自己库；跨服务数据交换只走 API/事件；Seata 表保留在各自 RM 库。短期至少显式声明"逻辑多服务单库"并停止宣称 database-per-service。

---

## High

### H-1. JWT 密钥等敏感配置硬编码默认值，生产可静默降级为已知密钥
- **问题描述**：`common/.../security/JwtProperties.java` 中 `secret = "aetherflow-dev-secret-key-change-me-32bytes-minimum"`；`auth-service` yml 与 gateway yml 同样以该串作 `${JWT_SECRET:...}` 默认值；`refresh-secret`、`github.state-secret` 也有可读默认。`application-prod.yml` 仅覆盖 host 类配置，**未强制要求 secret**，未 fail-fast。
- **影响**：若生产未注入 `JWT_SECRET`，服务以源码内已知密钥启动，攻击者可伪造任意用户/角色的 JWT，鉴权整体失守。
- **涉及文件**：`backend/common/src/main/java/com/aetherflow/common/security/JwtProperties.java`；`auth-service/src/main/resources/application.yml`；`gateway-service/src/main/resources/application.yml`。
- **修复建议**：移除源码默认值，改为 `@NotBlank` 校验；prod profile 启动时若 secret 缺失/为占位符则直接抛异常退出；密钥经 Nacos 加密配置或 K8s Secret 注入；密钥长度≥32 字节并轮转。

### H-2. 工作流运行时线程池过小且异步任务拒绝无兜底，导致实例永久卡在 RUNNING
- **问题描述**：`WorkflowRuntimeConfig.workflowRuntimeTaskExecutor()` 为 `ThreadPoolTaskExecutor`（core=2, max=4, queue=20，默认 AbortPolicy）。`WorkflowServiceImpl.startInstance()` 在 `@GlobalTransactional` 内 `workflowRuntimeTaskExecutor.execute(() -> executeRuntime(...))` 异步执行 DAG；而单次 DAG 含**同步** AI 节点（Feign readTimeout=30min）。当池+队列满（>24 并发工作流），提交被 `RejectedExecutionException` 抛出，`executeRuntime` 永不执行，`af_workflow_instance.status` 永久停留 `RUNNING`，无任何扫描/补偿。
- **影响**：并发能力（≤4）与 AI 长耗时严重失配；高负载下工作流"假活"，业务侧无法感知失败，资源/配额泄漏。
- **涉及文件**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java`；`workflow-service/.../service/impl/WorkflowServiceImpl.java`（startInstance/executeRuntime）。
- **修复建议**：① 提交前显式 catch `RejectedExecutionException` 并将 instance 置 FAILED + 发事件；② 改用 `CallerRunsPolicy` 或有界队列+告警；③ 大幅提升池容量或改为"提交到 RabbitMQ + task-service 调度"的真正异步模型；④ 增加定时扫"超时 RUNNING"实例的恢复任务（已有 `WorkflowRuntimeRecoveryService`，需覆盖此场景）。

### H-3. 无分布式链路追踪（仅手工 trace-id 透传）
- **问题描述**：全工程仅 `gateway/TraceLoggingFilter` 设置/透传 `X-Trace-Id`，各服务有 `AuthTraceContextFilter` 之类做日志 MDC 关联；但**无 micrometer-tracing / Zipkin / SkyWalking / OpenTelemetry 依赖**（pom grep 为空，仅 `spring-boot-starter-actuator`）。7 个 Java 服务 + Python + RabbitMQ 跨调用没有 span/调用树。
- **影响**：跨服务故障无法可视化定位，AI 长链路（gateway→workflow→ai→python）排障靠人肉拼日志；无 latency breakdown，无法满足生产可观测性要求。
- **涉及文件**：根 `pom.xml`、各服务 `pom.xml`（缺 tracing 依赖）；`gateway-service/.../filter/TraceLoggingFilter.java`。
- **修复建议**：引入 `micrometer-tracing-bridge-brave` + `zipkin-reporter`（或 OTel），统一采样率；Python 侧用 OpenTelemetry SDK；RabbitMQ 注入 trace 上下文；网关 trace-id 改为尊重上游 W3C `traceparent`。

### H-4. Seata 分布式事务范围错配：仅包本地 insert，真正需一致性的链路反在其外
- **问题描述**：`WorkflowServiceImpl.startInstance` 标注 `@GlobalTransactional("aetherflow-start-workflow-instance")`，但方法体只做了本地 `instanceMapper.insert(instance)` + 异步 `executeRuntime` 提交（异步任务在全局事务提交后才运行，不在全局事务内），并无任何跨服务写。真实需要一致性的"创建实例 + 分发首个任务 + 扣配额"散落在异步链路中，无全局事务保障。
- **影响**：① 对单条本地 insert 开启全局事务是纯开销（注册 global/branch、持锁、写 undo_log）；② 真正的跨服务一致性需求未被覆盖，出现"该保的没保、不该包的在包"。
- **涉及文件**：`workflow-service/.../service/impl/WorkflowServiceImpl.java`（startInstance L122）；`file-service`/`task-service/.../application*.yml`（seata 配置）；`docker-compose.yml`（seata 1.5.2）。
- **修复建议**：重新梳理事务边界——把 `@GlobalTransactional` 放到真正跨服务写（如 startInstance 同步 dispatch 首任务/扣配额）的方法上，或改为本地事务 + 事件驱动最终一致性；移除仅本地写方法上的全局事务注解。

### H-5. AI 工作流节点走 30 分钟同步 Feign 链，与已有异步通道割裂
- **问题描述**：`AbstractAiWorkflowNodeExecutor.executeAi()` 经 `AiWorkflowNodeClient`（Feign）**同步**调用 `ai-service` `/ai/internal/workflow/nodes/execute`，ai-service 再同步调 Python runtime；workflow 与 ai 两端 Feign `readTimeout` 均设 `1800000`（30min）。同时项目又存在另一条 RabbitMQ 异步路径（task-service `TaskQueueProducer`→`ai-service` `AiTaskListener`→`AiTaskProcessingService`）。
- **影响**：DAG 节点线程与 ai-service 请求线程长时阻塞，吞吐受线程数压制；两套 AI 执行模型并存，行为/重试/指标割裂；长同步链无降级出口。
- **涉及文件**：`workflow-service/.../client/AiWorkflowNodeClient.java`；`workflow-service/.../node/executor/AbstractAiWorkflowNodeExecutor.java`；`ai-service/.../controller/AiWorkflowNodeController.java`；`ai-service/src/main/resources/application.yml`（python-ai read-timeout 1800000）；`workflow-service/.../application.yml`（openfeign readTimeout 1800000）。
- **修复建议**：长耗时 AI 节点统一改异步：workflow 投递任务到已有 RabbitMQ 队列，ai-service 处理后回调/事件通知 workflow 推进 DAG（复用现有 snapshot/恢复机制）；保留同步路径仅用于短交互；显式区分同步/异步节点类型。

---

## Medium

### M-1. Elasticsearch / Kibana 已部署但零使用
- **问题描述**：`docker-compose.yml` 起了 `elasticsearch:7.17.7` + `kibana`，但全工程**无任何 ES 客户端依赖**（pom 无 `elasticsearch`）、无 `@Document`/`ElasticsearchClient`/`RestHighLevelClient` 代码。知识库检索用的是 `MockVectorStore`。
- **影响**：资源浪费（ES 内存占用大）；使"日志/搜索"栈宣称失真；实际既无日志聚合后端也无搜索后端。
- **涉及文件**：`docker-compose.yml`；各 `pom.xml`；
- **修复建议**：要么接入（知识库全文检索、日志聚合到 ES+Filebeat）并补依赖，要么从 compose 移除避免误导。

### M-2. 网关 discovery.locator 开启，全服务（含 internal 端点）经 `/{service-id}/**` 可达
- **问题描述**：`gateway-service/application.yml` 同时配置了显式路由与 `spring.cloud.gateway.discovery.locator.enabled=true`（lower-case-service-id）。后者使 `/file-service/**`、`/task-service/**` 等直达任意服务任意路径。Internal 端点虽有静态 internal-token 二次校验、全局 JWT filter 仍生效，但攻击面与路由二义性显著。
- **影响**：内部端点对外暴露面扩大；显式路由与发现路由并存易误配；难以收敛对外路径。
- **涉及文件**：`backend/gateway-service/src/main/resources/application.yml`。
- **修复建议**：关闭 `discovery.locator.enabled`，仅保留显式路由；`/internal/**` 在网关层显式 deny；或为内部调用走独立端口/网络策略。

### M-3. Feign 仅有 Sentinel 熔断、无 Fallback
- **问题描述**：`feign.sentinel.enabled=true`（workflow/ai/task），但 6 个 `@FeignClient`（`AiWorkflowNodeClient/FileMetadataClient/NotifyInternalClient/TaskClient/FileClient/TaskStatusClient`）均无 `fallback`/`fallbackFactory`。
- **影响**：熔断打开或远端失败直接抛异常，workflow 节点退化为 `SERVICE_UNAVAILABLE` 失败；无业务默认值/降级数据。
- **涉及文件**：`backend/workflow-service/.../client/*`、`backend/ai-service/.../client/*`。
- **修复建议**：为关键客户端提供 `fallbackFactory`（返回缓存/默认/部分结果并标记降级），结合节点级 RetryPolicy。

### M-4. 无 logback 配置，无文件日志与集中日志
- **问题描述**：全工程无 `logback-spring.xml`，仅各 yml 的 console pattern；无文件滚动 appender、无 ELK/Loki 对接。
- **影响**：容器化下日志仅 stdout，排障与审计薄弱；与 M-1、H-3 叠加，可观测性三支柱缺"日志"与"追踪"两柱。
- **涉及文件**：各服务 `src/main/resources`（缺 logback）；`application.yml` 的 `logging.pattern`。
- **修复建议**：统一 logback-spring.xml（JSON 结构化 + 文件滚动 + trace-id 注入 MDC），对接 Loki/ES；保留 X-Trace-Id 进 MDC。

### M-5. WebSocket 允许任意来源 + token 走查询参数
- **问题描述**：`notify-service/.../config/WebSocketConfig.java` `setAllowedOrigins("*")`；`/notify/ws` 在网关 `permit-all`；`StreamTokenHandshakeInterceptor` 从 query `streamToken`/`token` 取鉴权令牌。
- **影响**：跨站 WebSocket 劫持（CSWSH）风险；token 进 URL 易被访问日志/浏览器历史/Referer 泄露。
- **涉及文件**：`backend/notify-service/.../config/WebSocketConfig.java`；`.../service/StreamTokenHandshakeInterceptor.java`；`gateway-service/.../application.yml`（permit-all 含 `/notify/ws`）。
- **修复建议**：`setAllowedOrigins` 收敛为前端域名列表；token 改走握手 `Sec-WebSocket-Protocol` 子协议或首帧消息；网关对 WS 合法来源校验。

### M-6. auth-service 膨胀为"认证+用户+设置+OAuth+计费"上帝服务
- **问题描述**：auth-service 同时承载 UserController/UserService、Settings（profile/member/billing/audit）、Github+Google OAuth、LoginAudit、Session 等；与"auth/user 拆分"预期不符。
- **影响**：单一职责被稀释，部署/变更牵连面大，团队协作易冲突。
- **涉及文件**：`backend/auth-service/src/main/java/com/aetherflow/auth/{controller,settings,oauth,session,audit}`。
- **修复建议**：将 `settings`（及 billing/member/audit）拆为独立 `user-service`/`account-service`，auth 仅负责认证与 token；或至少在模块内做清晰包边界 + 独立部署单元规划。

### M-7. Actuator/网关 permit-all 暴露面偏大
- **问题描述**：各服务暴露 `health,info,metrics`（metrics 含内部计数器）；网关 `permit-all` 含 `/actuator/**`、`/health`、`/v3/api-docs/**`、`/*/v3/api-docs`、`/swagger-ui/**`。
- **影响**：metrics/swagger 在生产对外可访，信息泄露；网关 actuator 全放行。
- **涉及文件**：各 `application.yml` 的 `management.endpoints`；`gateway-service/.../application.yml` 的 `aetherflow.gateway.security.permit-all`。
- **修复建议**：prod 收敛为仅 `health`（liveness/readiness）；swagger/api-docs 仅在非生产放行；actuator 走独立 management 端口或网关白名单 IP。

---

## Low

### L-1. 每次 DAG 执行新建并销毁固定线程池
- **问题描述**：`WorkflowRuntimeEngine.executeDag()` 内 `Executors.newFixedThreadPool(workerCount(dag.nodeCount()))`，`finally` `shutdownNow()`，每次运行创建/销毁线程。
- **影响**：高并发下线程创建/GC 抖动；未复用池。
- **修复建议**：复用长生命周期池（按并发上限配置）或纳入 runtime 执行器统一管理，按 DAG 并行度提交任务而非新建池。
- **涉及文件**：`workflow-service/.../runtime/engine/WorkflowRuntimeEngine.java`（executeDag L246-283）。

### L-2. 服务间鉴权用共享静态 token
- **问题描述**：`InternalFileController`/`InternalTaskController` 用静态 `X-Internal-File-Token`/`TASK_SERVICE_TOKEN`（constant-time 比对，但为共享明文密钥）；无 mTLS/签名/短期凭证。
- **影响**：单点泄露即全域横向风险（虽比较时防时序攻击）。
- **修复建议**：网络层 mTLS（内部网格）或 JWT/短期令牌；token 经 Secret 注入并定期轮转；内部端点仅内网可达。
- **涉及文件**：`file-service/.../controller/InternalFileController.java`；`task-service/.../controller/InternalTaskController.java`；`common/.../core/InternalHeaders.java`。

### L-3. 前端 X-Trace-Id 与网关 trace 关联策略需对齐
- **问题描述**：前端 `apiClient.ts` 客户端生成 `X-Trace-Id`（crypto.randomUUID）并发送；网关 `TraceLoggingFilter.resolveTraceId` 会复用或覆盖上游 trace-id（需确认策略一致）。前端层整体较健壮（401 自动 refresh、幂等重试、orval 契约生成）。
- **影响**：若策略不一致，前端 trace 与网关 trace 断链或被静默覆盖。
- **修复建议**：统一为 W3C `traceparent`；明确"客户端仅在不带 traceparent 时生成"；网关尊重上游并补全。
- **涉及文件**：`frontend/src/api/client/apiClient.ts`；`backend/gateway-service/.../filter/TraceLoggingFilter.java`。

---

## 整体评价

**架构亮点**：自研 DAG Runtime（节点注册表/状态机/快照/恢复/Redis 锁/事件发布）设计完整、可独立演进；网关层 JWT + Redis 黑名单 + Sentinel 分组限流降级较成熟；内服务端点有二次 token 校验且失败闭合；前端 axios 层（trace/401-refresh/重试/契约生成）规范；AI 多 Provider 抽象（Ollama/OpenAI/PythonRuntime）可扩展。

**最需优先治理（按 ROI）**：
1. C-2 共享数据库 → 落实 database-per-service（数据边界是一切微服务化的前提）；
2. C-1 移除死引擎 Activiti（消除 schema 污染与认知负担）；
3. H-1 强制生产密钥 fail-fast（安全底线）；
4. H-2 异步执行池拒绝兜底 + 容量（防工作流假活）；
5. H-3 + M-4 链路追踪 + 结构化日志（补齐可观测性）；
6. H-4/H-5 事务边界与 AI 同步链重构（可靠性与吞吐）。
