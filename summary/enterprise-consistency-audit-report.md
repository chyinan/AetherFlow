# AetherFlow 开题报告与企业级产品一致性审计

> 审计日期：2026-08-30  
> 审计范围：指定开题报告、前端、Java 微服务、Python AI Runtime、数据库迁移、RabbitMQ、Redis、MinIO、Nginx、Docker Compose、测试与性能门禁。  
> 审计方式：只读代码追踪、9 页 Word 原文逐页核验、全量回归、生产构建、契约测试与 Compose 配置验证。

## 结论

AetherFlow 不是空壳，也明显超过普通学生演示项目：核心微服务、租户隔离、DAG 引擎、RabbitMQ AI 任务、运行快照、Redis 锁、SSE/WebSocket、文件治理、Provider 熔断与 Outbox 等均有真实实现和测试。

但当前仍不能被认定为“可抗大并发、抗压能力强、稳定性极强的企业级产品”。开题报告中存在若干没有兑现或只部分兑现的承诺；更重要的是，项目尚缺生产高可用拓扑、真实容量证据、灾备与故障接管闭环，并存在会让真实用户拿不到结果或让任务永久卡住的可靠性缺陷。

判定层级：

- 已实现：存在真实前后端/服务端闭环。
- 部分实现：代码存在，但语义、可运行条件或交付闭环不完整。
- 未实现：只有 UI 名称、类型、配置或近似功能，没有承诺中的执行能力。
- 未证明：可能可运行，但没有新鲜真实环境、容量或故障验证证据。

## 功能承诺一致性矩阵

| 报告承诺 | 判定 | 项目事实 |
| --- | --- | --- |
| Spring Cloud 微服务、Gateway、Nacos、OpenFeign | 已实现 | 8 个业务模块、统一 Gateway、Nacos 注册/配置和 Feign 客户端真实存在。 |
| Sentinel 与 Seata 治理 | 部分实现 | Gateway/Task/AI 有真实 Sentinel 规则；Seata 已接入，但主工作流启动事务中没有远程写，实际跨服务事务主要由 demo 端点证明。 |
| 注册、密码登录、第三方登录、退出和统一鉴权 | 基本实现 | 注册/登录/刷新/注销、Google/GitHub OAuth、JWT、Redis session、黑名单和 Gateway RBAC 均存在。 |
| 用户信息维护 | 未完整实现 | 没有面向当前账号的用户名、邮箱、密码等资料维护 API；Settings Profile 是平台/工作区配置，不等同于用户账号资料。 |
| 工作流创建、编辑、保存、删除、列表 | 已实现 | Controller 与持久化服务闭环存在，并按 ownerUserId 隔离。 |
| 工作流复制、预设工作流模板 | 未实现 | 只有“复制节点”和提示词/转换模板；未找到复制整个工作流或预设工作流模板接口。 |
| DAG 拖拽、连线、循环/连接/配置校验 | 基本实现 | Vue Flow、前后端映射、DAG 构造、节点注册和 AI 能力预检存在；配置完整性主要依赖各执行器运行时校验。 |
| 文件输入节点 | 已实现 | 后端 UPLOAD 节点校验用户归属并传递文件元数据。 |
| 独立 FFmpeg 音视频处理节点 | 未实现 | 前端 `ffmpeg` 保存时映射为后端 `UPLOAD`；没有 FFmpeg NodeType/Executor。FFmpeg 只在 Whisper 内部用于音频标准化。 |
| Whisper 音视频转写和时间信息 | 部分实现 | faster-whisper、FFmpeg 和 SRT 时间轴真实存在；默认关闭，且生成 SRT 的存储/下载闭环有严重缺陷。 |
| OpenAI/Ollama 文本生成、总结、翻译 | 代码已实现，运行未证明 | 节点与 Provider 路由真实存在；Compose 默认 `ENABLE_LLM=false`，需要外部凭据/Ollama。 |
| OCR 图片与扫描文档 | 已实现 | Tika 文本提取和 Tesseract 扫描回退存在，带格式/大小/字符上限。 |
| Embedding、知识库加工、语义检索/RAG | 已实现 | Ollama Embedding、数据集/文档/分片、向量存储和检索节点存在；当前只承诺 Ollama。 |
| Stable Diffusion、ComfyUI 图像生成 | 代码已实现，运行未证明 | 两个真实适配器和健康预检存在，但默认关闭且依赖外部服务。 |
| 输出节点整理并提供查看/下载 | 部分实现 | 前端 output 映射 END，只整理变量；真正生成下载文件的是独立 EXPORT 节点，且只支持 MD/TXT/JSON。 |
| 异步任务、状态、超时、重试、失败处理 | 基本实现 | AI 任务 RabbitMQ、DLQ、状态缓存、重试、超时扫描、运行快照与 WAITING 看门狗存在；进程崩溃恢复仍有关键缺口。 |
| 工作流取消 | 部分实现 | 状态机与数据库 SQL 支持 CANCELLED，但没有用户主动取消运行的公开 API。 |
| RabbitMQ 解耦工作流提交与执行 | 部分实现 | RabbitMQ 解耦 AI 节点任务和通知；工作流提交后由 workflow-service 本地有界线程池执行，不是 MQ 驱动的完整工作流调度。 |
| 文件上传、下载、查询、删除和元数据 | 已实现 | 普通文件链路较完整，包含分片、去重、限速、签名下载和租户校验。 |
| 输入、中间件和输出文件统一保存 | 部分实现 | 导出和图像结果有 MinIO 路径；Whisper SRT 当前只落 Python 临时目录并产生幽灵元数据。 |
| SSE 与 WebSocket 实时状态/日志 | 基本实现 | 工作流运行流有持久事件、游标续传和 WS 令牌；通知流在单实例可用，多副本一致性不足。 |
| Provider 优先级、超时、限流、故障切换与恢复记录 | 部分实现 | LLM 重试、熔断、切换、健康和日志存在；策略超时未生效、策略是全局管理员级、图像 Provider 没有自动切换。 |
| Docker Compose、Nginx 和基础设施统一部署 | 已实现开发/单机部署 | 服务齐全，但属于单机单实例 Compose，不是企业 HA 部署。 |
| 功能、接口和压力测试 | 测试框架存在，容量结论未证明 | Java/前端回归通过；性能门禁契约通过，但真实基线没有在本轮运行，默认规模也只有 10 线程。 |
| 高并发提交、队列处理、服务保护、异常恢复稳定性 | 未证明且存在反证 | 没有真实高并发/浸泡/故障注入结果；本地线程池、固定 AI 消费并发和崩溃恢复问题限制了结论。 |

## 生产发布阻断项（P0）

### P0-1：Whisper 字幕文件是“幽灵文件”

- Python Runtime 的 `_write_generated_subtitle` 只写本容器临时目录，返回看似 MinIO objectKey 的字符串。
- Compose 没有把该目录挂载到 MinIO，也没有上传代码。
- AI Service 随后调用 file-service “对象已在 MinIO”的元数据登记接口。
- 登记请求没有 userId；file-service 允许生成 userId 为空的 AVAILABLE 记录。
- 结果：数据库可能显示文件存在，但 MinIO 没有对象；即使元数据存在，普通用户也无法按租户查询/下载。

这直接违背“转录结果统一保存、用户可下载”的承诺。

### P0-2：AI Worker 崩溃会遗留不可接管的 RUNNING 任务

- AI 消费者先写 `af_ai_job=RUNNING` 再执行模型。
- 如果进程在推理中崩溃，RabbitMQ 会重投，但新消费者看到 RUNNING 后直接忽略。
- 未找到 RUNNING 租约、心跳、陈旧任务扫描或 CAS 接管逻辑。
- Task/Workflow 最终只能超时失败，不能恢复原任务，无法满足强异常恢复要求。

### P0-3：当前部署形态没有高可用和灾备闭环

- MySQL、Redis、RabbitMQ、MinIO、Nacos、Gateway、各业务服务均为单实例。
- Nacos 明确使用 standalone；RabbitMQ 不是 quorum 集群；MinIO 不是分布式部署。
- 没有副本、滚动升级、反亲和、PodDisruptionBudget、自动扩缩容、跨节点故障转移。
- 没有数据库/对象存储备份、恢复演练、RPO/RTO 或灾备脚本。
- 本轮 Compose 配置验证还因缺少初始化后的 `.env`/`MYSQL_ROOT_PASSWORD` 直接失败。

### P0-4：公网生产安全闭环不完整

- Nginx 只监听 HTTP，没有 TLS/HSTS；也没有 CSP。
- Java 服务除 code-runtime 外没有显式 CPU/内存/pids 限制，基础设施也没有统一资源预算。
- 应用默认使用 MySQL root 账号；单机密钥来自 `.env`，没有企业 Secret/KMS/Vault 生命周期。

若只在受控内网演示，风险可暂时接受；若对公网或承载企业数据，应阻断上线。

## 高优先级问题（P1）

### P1-1：Provider 策略的请求超时没有生效

`ProviderRoutingPolicy.requestTimeout` 可配置且默认 60 秒，但生产调用路径没有读取它。实际 Python AI RestClient 默认读取超时为 30 分钟。所谓“超时后快速切换 Provider”可能要等待固定客户端超时，而不是用户策略值。

### P1-2：工作流提交没有被 RabbitMQ 完整解耦

工作流实例入库后投递到本服务线程池，默认最大 50 个执行线程、100 个等待任务，队列满即 429。RabbitMQ 主要负责 AI 节点任务。该设计能保护单实例，却不能证明高峰削峰、跨副本公平调度或服务重启时提交不丢。

### P1-3：AI 消费吞吐配置没有真正生效

监听器注解只使用 `listener-concurrent-consumers`，默认固定 2；`listener-max-concurrent-consumers=6` 只存在于配置对象，没有绑定到监听容器。高峰时吞吐受固定消费者限制。

### P1-4：通知 SSE/WS 不能安全横向扩容

连接表存在 notify-service 进程内存中。RabbitMQ 消息只会被一个消费者实例处理；如果用户连接在另一副本，实时推送丢失。数据库历史仍在，但“实时”语义不成立，也没有 SSE 游标重放。

### P1-5：跨存储写入缺少统一一致性策略

Export/Image 等链路存在“先写 MinIO、后写数据库”的窗口；后一步失败时可能留下孤儿对象。Whisper 是更严重的反向情况。需要统一对象状态机、Outbox/Saga、补偿清理和定期对账。

### P1-6：Seata 更多是接入证明，而不是主业务分布式事务保障

主 `startInstance` 的 `@GlobalTransactional` 内只插入 workflow-service 本地实例；真正的 Task/AI 调度在异步线程中发生，已脱离该全局事务。跨服务回滚主要由 demo 端点演示，不能据此宣称主链路由 Seata 保证一致性。

### P1-7：真实性能证据不足

- 默认真实基线：10 线程、20 秒加压、3 次循环。
- 本轮通过的是门禁正反例和 1 线程 Mock Gateway 契约，不是生产环境负载。
- 没有 AI 重任务、长音视频、并行大文件、图片批量生成、峰值突发、2–8 小时浸泡、依赖抖动或节点故障测试。

## 中优先级差距（P2）

- 缺少整个工作流复制和预设工作流模板。
- 缺少真正的用户账号资料维护。
- 缺少用户主动取消运行、人工重试失败节点等完整运维动作。
- output 节点语义与报告描述不一致，下载依赖额外 export 节点。
- Provider 策略是全局管理员配置，不是按用户/租户策略；图像 Provider 不参与自动故障切换。
- 通知 SSE 没有心跳、有限超时和游标重放；断线恢复依赖历史列表补偿。
- 没有 Hikari 连接池、服务线程池和 Java 堆的容量预算与联动参数。
- Compose 中 `minio/minio:latest` 是可变镜像，不利于可重复部署和回滚。
- Elasticsearch/Kibana 被启动，但没有日志采集链路；没有 Prometheus/Grafana/Alertmanager 或明确 SLO 告警。
- Nginx upstream 只有一个 Gateway，没有负载均衡和健康摘除配置。

## 已验证的真实能力

2026-08-30 新鲜验证结果：

- `mvn test`：10 个 Maven 模块全部 SUCCESS，聚合 BUILD SUCCESS。
- `frontend npm test`：46 个测试文件、164 个测试全部通过。
- `frontend npm run build`：Vue TypeScript 校验和 Vite 生产构建通过。
- 前端工作流映射、分支路由、编辑器 P0、真实模型选项、知识检索入口、通知契约、本地 Runtime 与生产安全检查通过。
- 性能门禁 self-test 通过，能够正确接受正例并拒绝负例。
- JMeter 契约测试通过，但目标是确定性 Mock Gateway，threads=1，不代表真实容量。
- `aetherflow-verify-deployment.ps1 -ConfigOnly` 失败：缺少初始化后的 `MYSQL_ROOT_PASSWORD`。
- Python API 测试未能启动：当前全局 Python 环境的 `pydantic` 与 `pydantic-core` 版本不兼容；不能把 Python Runtime 判为已通过新鲜回归。

## 企业级整改顺序

### 第一阶段：先修正确性和可恢复性

1. 字幕/AI artifact 必须直接上传 MinIO，再携带 userId、workflowId、artifactKind 和校验信息登记；下载前验证对象存在。
2. AI Job 引入租约、heartbeat、attempt、ownerWorker 和 stale RUNNING 接管；所有状态迁移使用 CAS/版本号。
3. 把 Provider requestTimeout 真实下沉到每次调用，并补超时后切换的集成测试。
4. 为 Export/Image/Subtitle 建立统一 Outbox/Saga 与对象-元数据对账清理。
5. 补用户取消、失败节点重试和强制终止外部任务的完整链路。

### 第二阶段：建立生产高可用底座

1. 使用 Kubernetes 或等价编排，业务服务至少双副本；Gateway/notify/workflow 做无状态化和跨副本事件总线。
2. MySQL 主从/组复制、Redis Sentinel/Cluster、RabbitMQ quorum、分布式 MinIO；明确备份、恢复、RPO/RTO。
3. TLS、Secret 管理、非 root 数据库账号、网络策略、资源 requests/limits、滚动升级和回滚。
4. 通知改为 Redis Pub/Sub、Kafka/Rabbit fanout 或专门 realtime gateway，并支持持久游标重放。

### 第三阶段：用证据证明“抗大并发”

1. 建立按场景分层的容量模型：API、工作流、队列、AI/GPU、文件 I/O 分开测。
2. 至少覆盖阶梯加压、峰值突发、长时间浸泡、消费者扩缩、依赖超时、Rabbit/Redis/MySQL/MinIO 故障与重启恢复。
3. 以 SLO 设门禁：成功率、P95/P99、队列等待、恢复时间、重复执行率、丢消息率、资源饱和度。
4. 每个版本保留可追溯 JTL、环境规格、数据规模、配置快照和报告，禁止用 Mock 契约代替真实容量结论。

### 第四阶段：修正文档表述

在上述问题修复前，文档应把以下表述降级为“计划/代码支持”：独立 FFmpeg 节点、工作流复制与模板、用户资料维护、按用户 Provider 降级、工作流提交 MQ 解耦、完整异常恢复、高并发稳定性、统一保存下载和企业级高可用。
