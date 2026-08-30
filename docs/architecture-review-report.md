# AetherFlow 架构审查状态

> 更新日期：2026-08-30。本文件记录当前状态；历史问题以 Git 历史为准。

## 已关闭的高风险问题

- 工作流执行统一使用自研 DAG Runtime；已移除未被业务使用的 Activiti 配置和依赖。
- 运行任务提交具有拒绝兜底与终态收口，不会因执行器拒绝而永久停留在 `RUNNING`。
- Docker Compose 中 JWT、刷新令牌和 OAuth state 密钥缺失时拒绝启动；初始化脚本生成安全随机值且保持幂等。
- 正式环境默认关闭前端 mock fallback 与 OCR mock，后端不可用时不伪装成功。
- 正式文档提取默认使用 `auto`：Office、邮件、EPUB、PDF 文本层和文本格式走 Tika，图片与扫描 PDF 走 Tesseract 回退；前端格式目录来自后端能力元数据。
- AI Service 输出真实工作流能力快照；Workflow Service 在实例落库前校验 LLM、Whisper 和图像 Provider，前端同步禁用当前环境不可执行的节点。
- Stable Diffusion WebUI 与 ComfyUI 已补齐 YAML/Compose 配置，但保持默认关闭；只有真实 Provider 注册成功时才进入可执行能力目录。
- 工作流运行事件以 SSE 为主，并提供绑定单一工作流的 60 秒令牌 WebSocket 备用通道；两种通道共享持久事件游标、心跳和终态语义。
- JMeter 核心计划已移除启用的空白采样器和 GUI 监听器，改用本地节点工作流；错误率、P95、P99 和最小样本数由 PowerShell 门禁自动判定。
- Run API、实时事件和知识库导入在正式模式下不再回退到演示数据。
- Compose 的 MySQL、Redis、RabbitMQ、MinIO、Elasticsearch、Nacos identity 和服务间 token 均由初始化脚本生成，缺失时拒绝启动；RabbitMQ definitions 不再写死公开密码。
- Whisper 与本地 LLM 改为显式启用，普通开发机启动 Compose 或 Python 服务时不会默认加载高负载模型。
- Seata 演示端点只在 `dev` profile 注册并且仍需认证；Mock 工作流节点不进入生产节点目录或生产执行器注册表。
- 浏览器刷新令牌迁移到 HttpOnly、SameSite=Strict Cookie，不进入 Web Storage 或 OAuth URL。
- Vue 页面按路由拆包，生产构建主入口约 422 kB，当前没有超大 chunk 警告。
- 设置页不再把未由后端配置或执行的 `/5`、`/20`、`/2 GB` 演示建议伪装成真实配额；资源卡只展示当前可观测值。
- OpenAI-compatible 与 Ollama 响应中的真实 token usage 会进入响应 metadata 和成功推理日志；缺少 usage 时保持未知，不估算 token。
- Ollama/本地模型不再以输入输出单价 `0` 和 `pricingConfigured=true` 伪装为零成本；在没有本地算力计量时明确标记为未计量。
- AI 价格快照支持按提供商、模型与生效时间显式配置，非法快照在启动时拒绝；只有真实输入/输出 token 与匹配快照同时存在时才计算并展示带来源的估算成本。
- 异步任务 traceId 现在随任务 DTO、数据库记录、重试重建和 RabbitMQ header 保存；AI 消费者恢复 MDC 并拒绝无法追踪的消息，不再在 HTTP 转 MQ 后静默丢失关联信息。
- Java 服务已接入 Micrometer OpenTelemetry bridge 与 OTLP exporter，Python FastAPI/httpx/requests 已接入 OTel instrumentation；Compose 提供 Jaeger，并为 RabbitMQ producer/listener 开启 observation。
- Compose 已增加一次性 Flyway 迁移服务；Task Service 会等待迁移成功再启动，已有 MySQL 数据卷可补齐任务 traceId 字段，不再依赖只对空数据卷生效的初始化 SQL。
- 正式 AI 节点已改走 Task Service 与 RabbitMQ：DAG 节点派发后进入 `WAITING` 并释放运行线程，成功事件回填输出并恢复后继节点，失败事件同时收口任务记录和工作流实例；前端将等待态明确显示为暂停等待，而不是持续运行。
- File/Task 内部接口使用 1 分钟 HMAC 签名凭证，AI/Workflow 调用端逐请求签发并校验 audience，长期共享密钥不再通过网络发送。

## 当前仍成立的架构风险

这些项目不是隐藏的可点击半成品，而是需要独立架构项目才能消除的系统性风险。

1. **数据边界**：多个服务仍共享主要 MySQL 实例和逻辑库，独立迁移、扩缩容及故障隔离能力有限。
2. **端到端可观测性验收**：Java、Python、HTTP 与 MQ 的 OTel 导出配置已经接通，但仍需在完整 Compose 环境执行一次真实跨服务请求并在 Jaeger 验证父子 span；当前设备未启动整套环境。
3. **服务数据层测试**：当前单元及契约测试覆盖主要逻辑，但完整生产式部署仍需真实 MySQL、Redis、RabbitMQ、MinIO 与 Nacos 的集成验收。

## 验证证据

- `mvn test`：10 个 Maven 模块、646 项测试全部通过。
- `frontend/npm test`：46 个测试文件、164 项测试通过。
- `frontend/npm run build`：类型检查和生产构建通过。
- 前端 14 个 `check:*` 脚本全部通过，其中包含生产安全、工作流映射、通知和数据接入契约。
- `python-ai-service`：17 项测试通过；`ai-runtime`：4 项测试通过。
- npm 官方 Registry 全依赖审计：0 个已知漏洞；Axios、PostCSS、Vite 及受影响的传递依赖已升级到修复版本。
- 6 个新增/更新 PowerShell 门禁脚本通过语法解析；JMeter XML 可解析。
- `git diff --check`：通过。
- JMeter 契约回归：确定性 Mock Gateway 下 11 个样本、0 个错误；性能门禁正反例自测通过。
- Docker Compose 配置门禁：使用临时强密钥环境成功展开 23 个服务；当前设备的 Docker Desktop Service 无启动权限，因此真实容器健康与负载烟测仍需在可用 daemon 上执行。

受当前设备散热限制，本机没有启动 Whisper、Ollama、FFmpeg 转码或本地模型。视频到文档的高负载链路以用户在另一台台式机上的实机验证为依据，本轮只验证其代码和轻量测试。

## 维护约定

- 每项结论应附可复现的代码、配置、自动化测试或运行证据。
- 已修复问题不得继续列为当前问题。
- 产品尚未开放的能力必须隐藏或明确显示禁用状态，不能用假数据伪装已实现。
