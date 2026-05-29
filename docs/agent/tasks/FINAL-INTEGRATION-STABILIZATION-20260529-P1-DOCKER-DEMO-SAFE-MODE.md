任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE
任务名称：Final Integration P1 Docker Demo Safe Mode
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-DOCKER
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-docker-demo-safe-mode
状态：IN_PROGRESS

任务目标：

1. Docker demo 环境默认启用可控 AI fallback，降低 Whisper/OCR/LLM/Ollama 异常导致演示中断的风险。
2. 将 `MINIO_PUBLIC_ENDPOINT` 从固定内网 IP 改为可配置默认 localhost，避免统一运行电脑外的演示环境返回不可访问 URL。
3. 给 workflow-service / Java 服务补齐 `OLLAMA_BASE_URL`，避免容器内默认 localhost 指向自己。
4. 前端 Docker build 传入 SSE、mock fallback、notify WS fallback、timeout 等已有 Vite 环境变量。

允许修改文件：

1. docker-compose.yml
2. frontend/nginx/Dockerfile
3. frontend/.env.example
4. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE.md
5. docs/agent/logs/2026-05-29.md
6. AGENT.md

禁止修改文件：

1. backend/**
2. python-ai-service/**
3. docker/**
4. frontend/src/**
5. frontend/package.json
6. frontend/package-lock.json
7. Workflow Runtime Core 与后端 Runtime 执行引擎

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否。
是否允许修改数据库：否。
是否允许修改配置：是，仅限上述 docker-compose / frontend Docker build demo 配置。

Agent 编码计划：

1. docker-compose.yml 中将 demo AI/fallback 环境变量改为 `${VAR:-safe-default}`。
2. Java 服务公共 env 增加 `OLLAMA_BASE_URL`、`WORKFLOW_OCR_MOCK`、`WORKFLOW_OCR_MOCK_TEXT`，并将 `MINIO_PUBLIC_ENDPOINT` 改为可配置默认 localhost。
3. frontend/nginx/Dockerfile 与 compose build args 增加 VITE_SSE_BASE / VITE_MOCK_FALLBACK / VITE_NOTIFY_WS_FALLBACK / VITE_API_TIMEOUT_MS。
4. `.env.example` 增加 demo safe mode 环境变量示例。
5. 运行 docker compose config、前端构建、静态检查和冲突标记扫描。

不会修改：

1. 不修改后端源码、DTO、DB、MQ、Redis、Nacos、Gateway。
2. 不安装 Tesseract 或改 Java runtime image。
3. 不改 AI Runtime 代码。
4. 不改业务 UI。

是否涉及契约变更：否。

文件锁范围：

1. docker-compose.yml
2. frontend/nginx/Dockerfile
3. frontend/.env.example
4. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE.md
5. docs/agent/logs/2026-05-29.md
6. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docker-compose.yml frontend/nginx/Dockerfile frontend/.env.example
4. docker compose config --quiet
5. cd frontend; npm run build
6. 统一运行电脑补测 docker compose up 与真实 Demo chain。

当前风险：

1. 本任务只能保证 compose 配置可解析，不能证明所有容器真实启动成功。
2. OCR mock 默认仅用于 demo 稳定，生产环境必须显式关闭。
3. Whisper/LLM 默认 safe fallback 会降低真实性，但可避免演示阶段 AI 依赖异常中断。

