# 进度追踪：开题报告与企业级产品实现一致性审计

> 创建时间：2026-08-30 | 状态：进行中

## 目标
完整核对开题报告中的功能与非功能承诺是否在 AetherFlow 项目中真实落地，并按企业级产品标准审计其并发、稳定性、容错、安全、可观测性和功能可用性。

## 成功标准
- 逐项列出报告承诺，并标记为已完成、部分完成、未完成、占位实现或证据不足。
- 每项结论提供可复核的代码、配置、测试、构建或部署证据。
- 识别仅有界面、接口声明、模拟数据或配置但缺少可运行闭环的功能。
- 按企业级大并发和高稳定性标准识别系统性风险，并给出严重度和整改优先级。
- 明确区分“功能存在”“生产可用”“经过容量/故障验证”三个层级。

## 已知约束
- 本轮只读审计，不修改论文原件或项目代码。
- 开发环境为 Windows 11，命令兼容 PowerShell。
- 保留用户已有的无关改动。

## 已读文件
<!-- 每读一个文件就追加一行，格式：- `路径` — 读到了什么关键信息 -->
- `summary/report-function-commitments.md` — 已有摘要列出平台、微服务治理、DAG、AI 节点、异步通信、前端、部署与测试承诺；其来源文件名与本次指定的 `(1).docx` 不完全一致，后续只作为线索，必须重新核验原文。
- `C:/Users/chyinan/Downloads/陈胤安 广州工商学院本科毕业论文（设计）开题报告  (1).docx` — 已通过 Word 只读分页、PDF 导出和 9 页图像逐页核验；核心承诺已整理到 `summary/enterprise-report-commitments.md`。
- `pom.xml` — 聚合 8 个后端模块；Java 17、Spring Boot 3.2.12、Spring Cloud 2023.0.5、Spring Cloud Alibaba 2023.0.3.3，并统一引入 OTel tracing。
- `frontend/package.json` — Vue 3、Vue Flow、Pinia、Axios 依赖齐全，包含单测、生产构建及多项契约检查脚本。
- `docker-compose.yml` — 定义 MySQL、Redis、RabbitMQ、MinIO、Nacos、Seata、Sentinel、可观测性、Python AI Runtime、Java 服务和 Nginx；大多为单实例 Compose，服务仅配置 `restart`，未体现集群编排和多副本。
- `performance-test/README.md` — 性能计划只覆盖稳定基线工作流，默认仅 10 线程×3 次，门禁为错误率 1%、P95 2 秒、P99 5 秒；明确历史 JTL 不能替代当前新鲜结果。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java` — 后端节点类型包含上传、OCR、Whisper、LLM、Embedding、图像生成、导出等，但没有独立 FFmpeg 节点类型。
- `frontend/src/api/mappers/workflowMapper.ts` — 前端 `ffmpeg` 被映射为后端 `UPLOAD`，只规范化文件 ID；不是 FFmpeg 音轨提取或格式转换执行器。
- `python-ai-service/app/main.py` — Whisper 转录路径会内部调用 FFmpeg 做标准化音频提取，并生成带时间段的 SRT；存在真实 Whisper+FFmpeg 运行链路，但没有供工作流单独调用的 FFmpeg 节点接口。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java` — 提供工作流创建、列表、详情、更新、删除、ComfyUI 导入和启动；没有工作流复制或预设工作流模板接口。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java` — DAG 与租户归属校验真实存在；启动实例使用本地线程池异步执行，不是通过 RabbitMQ 解耦工作流提交与执行。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/config/WorkflowRuntimeConfig.java` — 工作流执行器默认 core=10、max=50、queue=100，队列满快速拒绝；运行事件 MQ 发布默认关闭。
- `backend/workflow-service/src/main/resources/application.yml` — 配置运行时重试、持久快照恢复、WAITING 看门狗和 Redis 锁；默认事件 MQ 关闭，线程池容量有限。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowInstanceMapper.java` — 有取消状态更新 SQL，但没有面向用户的运行取消 API；主要仅在删除项目时调用。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicy.java` — 定义全局 Provider 优先级、重试、60 秒请求超时、熔断和健康检查参数。
- `backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRouter.java` — LLM 的 OpenAI/Ollama 重试、熔断、故障切换和日志真实存在；图像 Provider 不走该路由。
- `backend/ai-service/src/main/java/com/aetherflow/ai/config/AiClientConfig.java` — 实际 Python AI 调用使用固定读取超时（默认 30 分钟），没有使用 Provider 策略的 `requestTimeout`。
- `backend/ai-service/src/main/java/com/aetherflow/ai/image/ImageProviderRegistry.java` — 图像生成按请求精确选择单一 Provider，不具备 Stable Diffusion 与 ComfyUI 自动故障切换。
- `backend/ai-service/src/main/java/com/aetherflow/ai/task/AiTaskProcessingServiceImpl.java` — 有数据库幂等和终态 Outbox；若工作进程在推理中崩溃留下 `RUNNING` 记录，重投消息会直接忽略，未发现陈旧 RUNNING 租约或恢复器。
- `backend/ai-service/src/main/java/com/aetherflow/ai/service/AiTaskListener.java` — RabbitMQ AI 消费者固定并发为 2；配置中的最大并发 6 没有被监听容器使用。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EndNodeExecutor.java` — 前端“输出”节点只映射变量并结束流程，不负责生成可下载文件。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java` — 独立导出节点可写 MinIO 并登记元数据，支持 MD/TXT/JSON；对象写入与元数据登记失败间没有补偿清理。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/AsrNodeExecutor.java` — Whisper 结果把 SRT objectKey 登记为 AI artifact。
- `backend/ai-service/src/main/java/com/aetherflow/ai/file/AiFileRegistrationService.java` — 只登记 bucket/objectKey，不携带用户 ID；生成文件元数据无法被普通用户资产查询/下载链路正常归属。
- `backend/file-service/src/main/java/com/aetherflow/file/controller/InternalFileController.java` — 内部元数据接口契约明确要求对象已经存在 MinIO，但不会校验对象是否真实存在。
- `backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java` — 普通上传、下载、删除、去重、签名 URL 和租户校验较完整；内部元数据创建允许空 userId。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/impl/NotificationServiceImpl.java` — 通知先持久化、事务提交后推送，并按 eventId 去重。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/SseEmitterRegistry.java` — SSE 连接仅保存在单进程内存，没有跨副本广播、持久游标或重放。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationWebSocketHandler.java` — WebSocket 会话也仅保存在单进程内存，多副本下消费者与连接落在不同实例时实时推送会丢失。
- `backend/task-service/src/main/java/com/aetherflow/task/config/RabbitMqConfig.java` — 队列持久化、Publisher Confirm、Returns 和 DLQ 已实现，但队列不是 quorum，Compose RabbitMQ 也是单节点。
- `backend/task-service/src/main/java/com/aetherflow/task/service/impl/TaskDispatchServiceImpl.java` — 任务创建具备 idempotencyKey 唯一约束和提交后发布补偿。
- `frontend/nginx/nginx.conf` — 正确处理 SSE/WS 无缓冲和敏感 query 日志，但仅 HTTP、单一 Gateway upstream，没有 TLS/HSTS/CSP 或负载均衡副本。

## 当前进度
审计报告与技术验证已完成，等待用户审阅并确认结论。

## 下一步
用户确认审计结论后，删除本进度文件；如需继续，可按 P0 顺序进入整改设计或实现。

## 发现的关键信息
<!-- 解决问题过程中发现的重要线索、根因、相关逻辑 -->
- 已有承诺清单覆盖功能与非功能要求，但不能直接沿用结论：摘要来源路径没有 `(1)` 后缀，需对本次文档独立取证。
- 原文的承诺范围明显高于“页面能演示”：包含第三方登录、工作流复制/模板、完整节点类型、超时/重试/取消、Provider 自动降级、分布式事务、SSE+WebSocket、压力测试和高并发稳定性验证。
- 仓库具备生产化基础设施和性能门禁框架，但当前默认性能规模只是开发基线，不能证明“大并发、抗压能力强”。
- Compose 中核心基础设施和应用服务大多为单实例；即使功能可用，也不能据此认定具备高可用或故障域隔离能力。
- 已确认首个明确不一致：报告承诺“独立 FFmpeg 音视频处理节点”，项目前端虽展示 `ffmpeg`，保存时却映射成 `UPLOAD`；FFmpeg 只作为 Whisper 内部预处理步骤存在。
- 工作流复制、预设工作流模板和真实用户账号资料维护未找到完整接口；节点复制与平台 Settings Profile 不能替代这些承诺。
- 报告承诺 RabbitMQ 解耦工作流提交/执行，但实际工作流实例先入库后交给本地有界线程池；RabbitMQ 主要用于 AI 节点任务和通知。
- Whisper SRT 下载闭环存在实质缺陷：Python 只写容器临时文件，未上传 MinIO；AI 服务却登记成 MinIO 元数据，而且没有 userId 归属。
- Provider 60 秒请求超时只是策略字段，实际 LLM 调用默认可等待 30 分钟；因此“超时后按策略快速切换 Provider”没有按配置兑现。
- AI 任务的幂等实现会把崩溃遗留的 RUNNING 记录永久视为正在执行，缺少租约/陈旧任务接管，影响异常恢复。
- 通知 SSE/WS 在单实例可用，但状态只保存在本进程；横向扩容后无法保证实时消息送达正确副本。
- 新鲜验证：`mvn test` 聚合 BUILD SUCCESS；前端 46 个测试文件/164 个用例通过；生产构建和相关契约检查通过。
- 性能 self-test 与 Mock Gateway JMeter 契约通过，但没有真实生产负载证据；不能据此宣称高并发已达标。
- 部署 ConfigOnly 验证因缺少 `MYSQL_ROOT_PASSWORD` 失败；Python API 测试因当前全局 Python 的 pydantic 依赖不兼容而未能启动。
- 完整结论已写入 `summary/enterprise-consistency-audit-report.md`。
