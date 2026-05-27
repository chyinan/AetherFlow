任务ID：AI-INFER-CENTER-20260527
任务名称：企业级 AI 推理任务中心
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260527-1949-codex-ai-infer
分支：feature/AI-INFER-CENTER-20260527-enterprise-ai-inference
状态：IN_PROGRESS

任务目标：
在不修改 workflow-service、gateway-service、auth-service、file-service、notify-service、common、MQ 契约、公共 DTO、公共数据库结构和 Gateway 的前提下，将 ai-service 和 python-ai-service 实现为企业级 AI 推理任务中心。能力包括 RabbitMQ AI 任务消费、异步推理、Whisper ASR、OpenAI/Ollama Provider 抽象、Prompt 模板与版本、AI Workflow 节点执行、Redis AI 任务状态和结果缓存、Sentinel 限流熔断、文件处理、推理完成通知和健康状态接口。

允许修改文件：
1. backend/ai-service/**
2. python-ai-service/**
3. backend/ai-service/pom.xml
4. backend/ai-service/src/main/resources/application.yml
5. backend/ai-service/src/test/**
6. python-ai-service/tests/**
7. docs/agent/tasks/AI-INFER-CENTER-20260527.md
8. docs/agent/logs/2026-05-27.md

禁止修改文件：
1. workflow-service/**
2. gateway-service/**
3. auth-service/**
4. file-service/**
5. notify-service/**
6. common/**
7. backend/common/**
8. backend/workflow-service/**
9. backend/gateway-service/**
10. backend/auth-service/**
11. backend/file-service/**
12. backend/notify-service/**
13. docker-compose.yml
14. docker/**
15. 根 pom.xml

是否允许新增文件：是
允许新增的位置：
1. backend/ai-service/**
2. python-ai-service/**
3. backend/ai-service/src/test/**
4. python-ai-service/tests/**
5. docs/agent/tasks/AI-INFER-CENTER-20260527.md
6. docs/agent/logs/2026-05-27.md

是否允许修改接口：是，仅允许 ai-service 与 python-ai-service 内部新增接口；不允许修改公共 DTO、MQ payload、workflow-service 回调契约或 Gateway 路由。
是否允许修改数据库：否
是否允许修改配置：是，仅允许 backend/ai-service/src/main/resources/application.yml 和 python-ai-service 自身配置文件。

Agent 编码计划：
1. 使用 TDD 先补 ai-service 单元测试，覆盖 nodeType 路由、Prompt 渲染、Provider 选择、Redis 状态缓存和失败状态流转。
2. 重构现有 AiInferenceServiceImpl，将 MQ 消费、任务编排、节点执行、Provider 调用、结果缓存和通知拆分为独立组件。
3. 保持 RabbitMQ 契约不变，继续消费 RabbitMqNames.AI_TASK_QUEUE 和 TaskMessageDTO。
4. 新增异步 AI 任务执行器，RabbitMQ listener 只接收任务并交给任务中心处理，任务内部写 DB 与 Redis 状态。
5. 新增 AI Workflow Node Executor：ASR、SUMMARY、TRANSLATE、SUBTITLE。
6. 新增 PromptTemplate、PromptVersion、PromptRenderService，采用 ai-service 内置模板版本，避免数据库结构变更。
7. 新增 OpenAI/Ollama Provider 抽象，Java 侧统一调用 Python runtime，由 Python 侧完成 Provider 协议适配。
8. 在 python-ai-service 中拆分 FastAPI 服务，补 ASR、LLM、Subtitle、FFmpeg、Provider 和统一错误处理。
9. 新增 /ai/status，保留 common 提供的 /health；Python 侧保留 /health 并补 /ai/status。
10. 新增 Sentinel 资源包装和 fallback，覆盖任务处理、ASR、LLM Provider 调用。
11. 完成后运行后端测试、Python 编译/测试，并记录无法执行项。

不会修改：
1. 不修改 workflow-service、task-service、gateway-service、auth-service、file-service、notify-service、common 的代码。
2. 不修改 RabbitMQ exchange、queue、routing key、TaskMessageDTO 字段或公共 DTO。
3. 不修改数据库建表脚本或新增表。
4. 不修改 Gateway 路由。
5. 不修改根 pom.xml、docker-compose.yml 或 docker/**。

是否涉及契约变更：否
文件锁范围：
1. backend/ai-service/**
2. python-ai-service/**
3. docs/agent/tasks/AI-INFER-CENTER-20260527.md
4. docs/agent/logs/2026-05-27.md

验证方式：
1. git diff --name-only main...HEAD
2. mvn -pl backend/ai-service -am test
3. python -m compileall python-ai-service
4. 如本机 Java 仍为 11，则记录后端 Maven 验证未执行或失败原因，并要求 Java 17 环境补测。

当前风险：
1. GitHub 当前连接失败，claim push 可能无法完成；claim push 未成功前禁止修改业务代码。
2. 本机 Maven 当前使用 Java 11，不满足项目 Java 17 要求，后端完整验证需要切换 JDK 或统一运行电脑补测。
3. workflow-service 没有现成 AI 结果回调接口；本任务不改 workflow-service，因此完成回调只能通过现有 notify MQ 或任务 payload 中已有 callbackUrl 执行，不能新增公共回调契约。
4. PromptTemplate/PromptVersion 不改数据库，采用内置版本注册表；如后续需要后台管理 Prompt，需要另开数据库契约任务。

环境检测：
- git：git version 2.53.0.windows.3
- java：openjdk version "11.0.31" 2026-04-21 LTS
- maven：Apache Maven 3.9.9，Java version 11.0.31，platform encoding GBK
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-27 19:49:34 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，原因是本机 Java 版本不是项目要求的 Java 17

开工同步记录：
- git status：main...origin/main，工作区干净
- git pull origin main：失败两次，原因分别为 GitHub 连接被重置、无法连接 github.com:443
- 当前处理：已创建本地 feature 分支，准备 docs-only claim；若 push 失败，将停止业务编码并标记阻塞。
