# 进度追踪：开题报告缺口生产级整改

> 创建时间：2026-08-30 | 状态：代码整改与自动化验证完成，待用户确认；实机 Docker 验收受本机权限阻断

## 目标
以企业可投产、工业级标准整改已确认缺口：AI/图像能力配置与启动前预检、真实文档解析、工作流 WebSocket 备用通道、Embedding 能力目录一致性、压力测试与部署门禁。

## 成功标准
五类缺口均形成代码、配置、前端交互和自动化测试闭环；不可用能力在执行前被明确阻止；前后端能力目录一致；压力测试可重复执行并按阈值失败；Java、前端、Python、Compose 静态配置和专项检查全部通过。

## 已读文件
- `C:\Users\chyinan\.codex\RTK.md` — 项目命令应使用 `rtk` 前缀。
- `C:\Users\chyinan\.agents\skills\using-plan-and-execute\SKILL.md` — 任务工作流与检查点。
- `C:\Users\chyinan\.agents\skills\docx\SKILL.md` — DOCX 文本提取与原始 XML 访问方法。
- `C:\Users\chyinan\.agents\skills\investigating-a-codebase\SKILL.md` — 从入口、搜索、引用链验证代码库。
- `C:\Users\chyinan\.agents\skills\focused-problem-solver\SKILL.md` — 进度文件、Summary 与验证要求。
- `C:\Users\chyinan\.agents\skills\verification-before-completion\SKILL.md` — 完成结论必须有新鲜验证证据。
- `C:\Users\chyinan\Downloads\陈胤安 广州工商学院本科毕业论文（设计）开题报告 .docx` — 提取出平台、微服务、工作流、AI 节点、异步实时通信、前端、部署和测试承诺。
- `summary/report-function-commitments.md` — 将报告承诺固化为代码审查清单。
- `README.md` — 确认项目定位、服务拓扑、默认开关和验证命令。
- `Architect.md` — 确认当前架构描述和端到端链路。
- `docs/architecture-review-report.md` — 确认已完成项、仍未做完整 Compose 实机验收的边界。
- `docs/frontend-backend-missing-apis.md` — 确认前后端接口已接入项和明确未开放项。
- `pom.xml`、`frontend/package.json` — 确认 Maven 模块、前端构建和专项检查入口。
- `backend/workflow-service/.../WorkflowController.java` — 工作流定义 CRUD、运行实例和 ComfyUI 导入入口。
- `backend/workflow-service/.../WorkflowRuntimeController.java` — 运行观测、事件、SSE 和人工审批入口。
- `backend/workflow-service/.../WorkflowRuntimeEngine.java`、`WorkflowDag.java` — DAG 校验、调度、WAITING、恢复和状态事件。
- `backend/workflow-service/.../WorkflowNodeCatalogService.java`、`WorkflowNodeTypes.java` — 节点目录和后端节点类型。
- `backend/workflow-service/.../node/executor/*.java` — Whisper、OCR、Embedding、知识检索、LLM、总结和图像节点执行逻辑。
- `backend/workflow-service/.../knowledge/service/impl/KnowledgeServiceImpl.java` — 知识库导入、分片、向量检索、过滤和 parent-child 逻辑。
- `backend/ai-service/.../AiWorkflowNodeController.java`、`.../DefaultAiNodeExecutorRegistry.java` — AI 节点内部调用和执行器注册。
- `backend/ai-service/.../image/*.java` — Stable Diffusion/ComfyUI Provider 和图像生成执行链。
- `backend/task-service/.../TaskQueueProducer.java`、`TaskQueueConsumer.java`、`TaskDispatchServiceImpl.java` — RabbitMQ 投递、消费、Redis 状态、重试、超时和死信。
- `backend/notify-service/.../NotifyController.java`、`NotificationWebSocketHandler.java`、`SseEmitterRegistry.java` — 通知 SSE/WS 和历史记录。
- `backend/file-service/.../FileController.java`、`frontend/src/services/api/fileApi.ts` — 文件上传、分片、进度、下载和删除。
- `frontend/src/router/index.ts`、`WorkflowPage.vue`、`WorkflowCanvas.vue`、`NodeInspector.vue`、`workflowMapper.ts` — 前端页面、Vue Flow 编辑、节点配置和后端映射。
- `frontend/src/utils/knowledgeFileSupport.ts`、`frontend/src/stores/difyStore.ts` — 知识库可导入文件格式和真实/演示回退边界。
- `frontend/nginx/Dockerfile`、`frontend/nginx/nginx.conf`、`docker-compose.yml` — Nginx、基础设施和服务部署配置。
- `python-ai-service/app/main.py`、`requirements.txt`、`Dockerfile` — Whisper/FFmpeg/LLM 服务端点、启用开关和依赖。
- `performance-test/README.md`、`performance-test/aetherflow-core-api.jmx` — 压力测试计划和运行方式。
- `backend/workflow-service/pom.xml` — 当前已有 Web、AMQP、Redis、Feign、Tess4J 和 PDFBox，尚无 WebSocket/Tika。
- `backend/workflow-service/.../WorkflowNodeCatalogItem.java`、`WorkflowNodeCatalogService.java` — 节点目录当前没有能力状态元数据，Embedding 和图像选项为静态值。
- `backend/workflow-service/.../AiWorkflowNodeClient.java`、`WorkflowServiceImpl.java` — AI Feign 目前只有执行接口，运行前预检仅覆盖 Code 与知识检索。
- `backend/ai-service/.../ProviderRuntimeCatalog.java`、`PythonProviderRuntimeCatalogClient.java` — 已有 Python `/ai/status` 读取路径，可扩展为类型化能力快照。
- `backend/ai-service/.../ImageProviderRegistry.java`、`DefaultAiNodeExecutorRegistry.java` — 可作为已注册 Provider/执行器的真实能力源。
- `backend/notify-service/.../StreamTokenService.java`、`StreamTokenHandshakeInterceptor.java` — 可复用短期 JWT 流令牌模式。
- `backend/workflow-service/.../RuntimeEventStore.java`、`RuntimeEventStreamService.java` — 已有游标增量查询和心跳，可复用到 WebSocket。
- `backend/*/src/test/...` 相关测试 — 已定位能力目录、控制器、Workflow 预检和 Provider 注册表测试入口。

## 当前进度
整改包 1（AI/图像能力目录与启动前预检）进入 TDD RED 阶段。

## 下一步
先写能力快照、Provider 可用性和工作流预检的失败测试，再实现最小生产代码。

## 发现的关键信息
报告承诺覆盖范围较广，必须区分“已有代码支持”与“端到端可运行”。
代码层已确认：
- 图像 Provider 类存在，但由 `@ConditionalOnProperty` 控制，仓库中未找到对应默认 YAML/Compose 开关，默认注册表可能为空。
- OCR Provider 的真实支持扩展名为 `png/jpg/jpeg/pdf`；前端文档提取器展示的格式远多于后端实际支持范围。
- 工作流运行时公开 SSE；WebSocket 实现位于通知服务，面向通知，不是同一个工作流运行流。
- Embedding Provider 实际只有 Ollama；节点目录还列出 `openai`、`huggingface` 选项，存在实现/目录不一致。
- 压力测试 JMX 存在，但当前仓库未发现结果文件；架构审查文档明确完整 Compose 和真实 AI/视频链路未在当前设备验收。

验证结果：
- `mvn test`：10 个 Maven 模块，全部通过，最终 `BUILD SUCCESS`。
- `frontend/npm test`：42 个测试文件、149 个测试通过。
- `frontend/npm run build`：类型检查和生产构建通过。
- 前端 14 组 `check:*` 专项检查全部通过。
- 隔离 Python 环境：`python-ai-service` 17 个测试通过，`ai-runtime` 4 个测试通过。
- Compose 静态配置在补齐临时占位环境变量后通过；当前真实 `.env` 缺少多个必需变量，直接 `docker compose config --quiet` 失败。
- `performance-test/results/aetherflow-core-api.jtl`：300 个样本、300 个失败；270 个为 Gateway 连接失败，另有 30 个脚本错误。

初步结论：
- 已实现：微服务拆分/网关/Nacos/Sentinel/Seata 接入、DAG 工作流和运行时、RabbitMQ/Redis 任务链、文件治理、通知 SSE/WS、知识库/检索、LLM/Whisper/OCR/Embedding 节点的代码链路和前端入口。
- 部分实现或未完成验收：Stable Diffusion/ComfyUI 默认没有 Provider 配置且 Provider 默认禁用；OCR/文档解析格式范围不匹配；工作流运行的 WebSocket 通道缺失（仅通知有 WS）；Embedding 目录列出 openai/huggingface 但实际只有 Ollama；压力测试结果未通过；默认 Compose 关闭 Whisper/LLM，当前环境也未完成整套容器实机验收。

整改方案收敛：
- AI Service 输出类型化能力快照；Workflow Service 在实例落库前做远端能力预检；前端读取同一能力源，禁用不可运行节点。
- 图像 Provider 仍保持外部服务模式和默认关闭，但补齐 Compose/YAML 映射、能力可见性和执行前失败，不把未配置能力伪装为可用。
- 文档解析采用 Apache Tika 3.2.3 标准解析器包处理 Office/邮件/EPUB/文本等格式，图片与扫描 PDF 继续由 Tesseract 路径处理；避免新建第二套节点体系。
- 工作流 WebSocket 复用短期 JWT、持久事件游标和心跳，不引入新的事件总线。

## 2026-08-30 实施更新：整改包 1 GREEN
- AI Service 已新增公开/内部工作流能力快照，能力来源为 Python 运行时状态、真实节点执行器注册表和真实图像 Provider 注册表。
- Workflow Service 已在创建运行实例前执行 AI 能力预检；不可达、能力关闭或指定 Provider 未启用时，以可操作的 503 原因失败，且不会插入实例记录。
- Stable Diffusion WebUI、ComfyUI 的 YAML、生产配置、Compose 和 `.env.example` 映射已补齐，仍保持默认关闭和 fail-closed。
- 前端节点模板已接入能力快照；节点面板、画布入口、Copilot 草稿入口和 Store 中央添加路径均阻止不可执行节点，已保存节点在检查器中显示不可用原因。
- Embedding 节点目录已收敛为当前真实实现的 Ollama，不再宣称 OpenAI/HuggingFace Provider。
- TDD 证据：能力类缺失、配置契约缺失和前端能力模块缺失均先出现 RED；随后后端相关模块测试、前端 155 项测试以及生产构建均为 GREEN。

## 当前进度（更新）
整改包 1 已完成代码与模块级验证；下一步进入整改包 2：统一文档解析能力、安全上限、OCR 自动路由和知识库二进制文档导入。

## 2026-08-30 实施更新：整改包 2 GREEN
- Workflow Service 引入 Apache Tika 3.2.3 标准解析包，真实提取 DOC/DOCX、XLS/XLSX、PPT/PPTX、PDF、MSG/EML、EPUB、OpenDocument、HTML/XML/Markdown/CSV/TXT 等白名单格式。
- 新增统一文档提取编排：Office/邮件/文本走 Tika，图片直接走 Tesseract，扫描 PDF 在无文本层时显式回退 Tesseract；Tika PDF 内部 OCR 被关闭，避免重复和不可控的隐式原生调用。
- 文档边界新增 25 MiB 输入限制、100 万字符输出限制、PDF 内存限制、禁用增量更新解析、禁止递归提取内嵌附件；未知扩展名在调用解析器前拒绝。
- OCR 默认 Provider 改为 `auto`，节点目录输出机器可读的 `supportedFileExtensions`；前端 Inspector 和知识库文件筛选读取同一能力范围。
- 知识库文件导入不再执行 `new String(bytes, UTF-8)`；导入和二进制预览均复用后端统一提取链，新增受租户文件下载约束的 `/knowledge/documents/source-preview`。
- TDD 证据：缺失解析类、DOCX 提取、知识库解析器调用、前端二进制格式和预览 API 均先出现 RED；随后 Workflow Service 300 项测试、前端 157 项测试和生产构建全部 GREEN。

## 当前进度（第二次更新）
整改包 1、2 已完成；下一步进入整改包 3：工作流运行事件 WebSocket 备用实时通道，复用短期流令牌和数据库事件游标。

## 2026-08-30 实施更新：整改包 3 GREEN
- Workflow Service 新增 `/workflow/runtime/stream-token/{workflowId}` 与 `/workflow/runtime/ws/{workflowId}`；令牌有效期 60 秒，并通过 JWT 角色声明绑定到单一工作流 ID。
- WebSocket 握手先验证签名和工作流范围，再查询实例归属；Gateway 只对该握手路径免 Bearer，并继续剥离伪造身份头。
- WebSocket 与 SSE 复用同一个 `RuntimeEventStreamService` 游标查询、心跳和终态语义；每次最多发送 500 个事件，连接数、线程数、轮询、心跳和租约均可配置。
- 前端正式运行订阅默认优先 SSE，连续重连或不可恢复错误时切换 WebSocket；每次 WebSocket 重连重新签发短期令牌，并从最后事件游标续传。仅在显式 demo fallback 开启且两种真实通道都失败时才进入模拟流。
- Nginx `/ws/` 与 `/sse/` 改用不记录 query string 的访问日志格式，避免短期流令牌落盘；Gateway 日志本身只记录 path。
- TDD 证据：令牌/握手类和前端 Runtime Socket 缺失先出现 RED；随后 Gateway 36 项测试、Workflow Service 307 项测试、前端 161 项测试和生产构建全部 GREEN。

## 当前进度（第三次更新）
整改包 1、2、3 已完成；下一步进入整改包 4：修复 JMeter 脚本、建立结果阈值门禁、部署预检和可重复验证命令。

## 2026-08-30 实施更新：整改包 4 GREEN（实机环境待 daemon）
- JMX 已停用遗留空白 HTTP sampler、GUI listener 和伪造身份头；基线工作流改为 `START -> TEMPLATE_TRANSFORM -> END`，不再让平台基线被外部 LLM/GPU 可用性污染。
- 新增 `aetherflow-performance-gate.ps1`：按总错误率、HTTP P95、P99 和最小样本数 fail-closed，并输出机器可读 JSON 摘要与失败标签。
- 新增门禁正反例、自测脚本、确定性 Mock Gateway 和真实 JMeter CLI 契约测试；当前契约运行 11 个样本、0 个错误。
- 新增带预检、时间戳独立结果目录、HTML 报告和阈值判定的性能运行器；旧 JTL 保留为历史诊断，不再作为当前版本通过证据。
- 新增部署验证器：先验证 Compose 展开和 12 个关键服务，再检查 Docker daemon、关键容器、公开健康入口，并可串联双用户性能烟测。
- `aetherflow-init-env.ps1` 支持安全的自定义输出路径，默认 OCR 更新为 `auto`，并写入运行事件 WebSocket 配置；使用临时强密钥环境成功展开 23 个 Compose 服务。
- 当前机器 `com.docker.service` 为 Stopped 且当前进程无启动权限，真实容器健康与真实负载烟测无法在本机执行；该外部条件由部署验证器明确返回失败，不会伪装通过。

## 当前进度（第四次更新）
四个整改包均已完成代码与专项验证；进入全仓测试、静态门禁、差异复核和项目上下文收口。

## 2026-08-30 最终验证
- Java：`mvn test`，10 个 Maven 模块、646 项测试，0 failure / 0 error / 0 skipped，`BUILD SUCCESS`。
- 前端：46 个测试文件、164 项测试通过；Vite 8.2.2 生产构建通过；14 个 `check:*` 门禁通过。
- Python：`python-ai-service` 隔离环境 17 项测试通过（1 个上游弃用警告）；`ai-runtime` 4 项测试通过。
- 供应链：npm 官方 Registry 全依赖审计为 0 漏洞；Axios、PostCSS、Vite 及传递依赖升级到已修复版本。
- 性能：门禁正反例通过；JMeter CLI 契约运行 11 个样本、0 错误，10 个 HTTP 样本 P95/P99 23ms（确定性本地 Mock，仅用于验证计划与门禁，不作为真实性能基线）。
- 部署：临时强密钥环境下 Compose 配置展开 23 个服务并通过关键服务检查；6 个 PowerShell 脚本语法、JMeter XML、Node mock server 语法和 `git diff --check` 均通过。
- 自审修复：文档下载前元数据大小预检、所有 OCR 分支二次大小校验、邮件正文/附件隔离、图像 Provider 真实健康探测、Python 状态短超时、不可用节点复制门禁和响应解包类型边界均已补齐。
- 未能执行：本机 Docker Desktop Service 停止且当前进程无启动服务权限，真实 23 容器健康、跨服务追踪和真实并发负载需在 Docker daemon 可用后运行 `scripts/aetherflow-verify-deployment.ps1 -RunPerformanceSmoke`。

## 状态
代码整改、自动化门禁和项目契约文档已完成；只剩外部 Docker 运行环境验收，不存在继续可在当前进程内完成的代码缺口。
