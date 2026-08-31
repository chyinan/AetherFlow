# 项目开发约定

Last verified: 2026-08-31

## 工业级加固契约

- 工作流启动必须先在本地事务中写入 `PENDING` 实例和唯一启动 Outbox；只有抢占成功的派发器才可提交运行任务。
- 工作流终态通知、任务重试和运行事件必须具备幂等、抢占、重试和保留策略；多副本扫描器不得依赖 JVM 内存锁。
- 节点保存/更新必须按服务端节点目录校验必填字段、类型和枚举；Embedding 生产环境禁止进程内向量存储，默认使用外部 Qdrant。
- 生产发布必须接入私有 Prometheus 指标、数据库连接池/队列告警，并以真实持续压测和故障演练作为容量证据。

## 语言和环境

- 始终使用简体中文回复，包括代码注释和提交信息。
- 开发环境为 Windows 11，命令和路径应兼容 PowerShell。

## 工作原则

- 可以直接读取和搜索项目文件，无需逐次确认。
- 根据当前环境中实际可用的工具完成文件读取、搜索、创建和编辑，不绑定特定工具名称。
- 优先编辑现有文件；确有必要时可以创建新文件。
- 修改前先了解相关上下文，并保留用户已有的无关改动。
- 可以运行与任务相关的只读检查、构建、测试、包管理和版本控制命令。
- 对删除、覆盖、重置等可能造成数据丢失的操作保持谨慎；目标或范围不明确时先询问。
- 多步骤任务可根据复杂度自行选择合适的计划和协作方式，不强制使用特定代理或任务管理工具。

## 当前产品契约

- 知识库数据集和文档创建接口支持操作级 `idempotencyKey`；同一用户/数据集范围内的重试必须返回原记录，不得重复创建。
- 知识库检索只使用 ready 数据集、文档和分片，并保持租户隔离；语义检索不得被固定词法候选上限截断。
- parent-child 分片中 parent 只用于上下文，检索结果返回 child 关联的 parent 上下文；元数据过滤必须是合法 JSON 对象。
- 工作流编辑器中的知识检索节点必须保留数据集选择、`topK`、输出变量和元数据过滤配置，并与后端节点契约一致。
- AI 节点可执行性以 AI Service 的运行时能力快照为准；Workflow Service 在实例落库前执行预检，前端只做提前反馈，不得绕过服务端 fail-closed 门禁。
- 图像 Provider 默认关闭；只有真实注册且运行时可用的 Stable Diffusion WebUI/ComfyUI Provider 才能出现在可执行能力中。
- 文档提取默认使用 `auto`：Office、邮件、EPUB、PDF 文本层和文本格式走 Tika，图片及扫描 PDF 走 Tesseract 回退；格式目录、25 MiB 输入限制和 100 万字符输出限制必须前后端一致。
- Embedding 节点当前只承诺 Ollama。目录不能列出尚无执行实现的 OpenAI 或 HuggingFace Provider。
- 工作流运行事件以 SSE 为主、WebSocket 为备用；WebSocket 使用绑定单一工作流的 60 秒流令牌、实例归属校验和持久事件游标续传。

## 投产验证

- `mvn test`：Java 全量回归。
- `cd frontend; npm test; npm run build`：前端测试与生产构建。
- `./scripts/aetherflow-performance-gate-self-test.ps1`：性能阈值门禁正反例。
- `./scripts/aetherflow-performance-contract-test.ps1`：不依赖 Docker 的 JMeter 计划契约回归。
- `./scripts/aetherflow-verify-deployment.ps1 -ConfigOnly`：Compose 和关键服务配置门禁；去掉 `-ConfigOnly` 后检查真实容器与公开健康入口。
