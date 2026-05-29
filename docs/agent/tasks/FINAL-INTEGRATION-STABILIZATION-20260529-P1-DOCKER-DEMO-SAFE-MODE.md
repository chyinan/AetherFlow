任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-DOCKER-DEMO-SAFE-MODE
任务名称：Final Integration P1 Docker Demo Safe Mode
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-DOCKER
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-docker-demo-safe-mode
状态：DONE

任务目标：

1. Docker demo 环境默认保持 Whisper/LLM 主线能力真实运行，同时保留可通过环境变量显式关闭的 fallback 开关。
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

1. docker-compose.yml 中将 demo AI/fallback 环境变量改为 `${VAR:-safe-default}`，其中 Whisper/LLM 默认启用。
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
3. Whisper/LLM 默认真实运行；如统一运行电脑资源不足，可通过环境变量显式关闭。

## 完成记录

时间：2026-05-29 22:40:00 +08:00
状态：REVIEW

完成内容：

1. `python-ai-service` 默认 `ENABLE_WHISPER=true`、`ENABLE_LLM=true`，保持主线 Whisper/LLM 演示真实运行；仍可通过环境变量显式关闭。
2. Java 服务公共 env 增加 `OLLAMA_BASE_URL`，workflow-service 容器默认指向 `http://host.docker.internal:11434`，避免容器内 localhost 错误。
3. `MINIO_PUBLIC_ENDPOINT` 改为 `${MINIO_PUBLIC_ENDPOINT:-http://localhost:9000}`，避免固定内网 IP。
4. workflow-service 默认 `WORKFLOW_OCR_MOCK=true`，仅用于当前 Java 容器无 Tesseract 时保护 OCR 演示；真实 OCR 容器化拆后续任务。
5. 前端 Docker build args 补齐 `VITE_SSE_BASE`、`VITE_MOCK_FALLBACK`、`VITE_NOTIFY_WS_FALLBACK`、`VITE_API_TIMEOUT_MS`。
6. `.env.example` 补充 demo safe-mode 示例，明确 Whisper/LLM 默认真实运行。
7. 未修改 backend、python-ai-service、业务 UI、接口、DTO、数据库、Gateway、Runtime Core。

验证记录：

1. `docker compose config --quiet`：通过。
2. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
3. `git diff --check`：通过。无 whitespace error，仅 Windows LF/CRLF 提示。
4. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docker-compose.yml frontend/nginx/Dockerfile frontend/.env.example`：通过。无冲突标记输出。
5. `docker compose config | rg -n "ENABLE_WHISPER|ENABLE_LLM|MINIO_PUBLIC_ENDPOINT|OLLAMA_BASE_URL|WORKFLOW_OCR_MOCK|VITE_NOTIFY_WS_FALLBACK|VITE_SSE_BASE"`：确认 Whisper/LLM 默认 true，MinIO/Ollama/OCR/Vite 参数按预期展开。

提交：

1. c030102 docs(agent): claim FINAL-INTEGRATION-STABILIZATION-20260529-P1-docker-demo
2. f56615e chore(docker): add demo safe mode defaults
3. c8e2483 chore(docker): keep whisper and llm enabled by default

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑补测 `docker compose up`、Whisper/LLM 真实链路、Ollama reachable、MinIO URL 可访问。
2. 真实 OCR 容器化/Tesseract 安装仍未做，当前 OCR demo 默认 mock。

文件锁：RELEASED。

## Main 合入记录

时间：2026-05-29 22:32:00 +08:00
状态：DONE
分支：main

合入结果：

1. feature 分支已通过 `--no-ff` 合入 main。
2. main merge commit：83ca01a。
3. 已确认 compose 展开后 `ENABLE_WHISPER=true`、`ENABLE_LLM=true`，主线 Whisper/LLM 不走 mock。

main 验证记录：

1. `docker compose config --quiet`：通过。
2. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
3. `git diff --check HEAD^1..HEAD`：通过。
4. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md docker-compose.yml frontend/nginx/Dockerfile frontend/.env.example`：通过。无冲突标记输出。
5. `docker compose config | rg -n "ENABLE_WHISPER|ENABLE_LLM|MINIO_PUBLIC_ENDPOINT|OLLAMA_BASE_URL|WORKFLOW_OCR_MOCK|VITE_NOTIFY_WS_FALLBACK|VITE_SSE_BASE"`：通过。确认关键 demo env 按预期展开。

统一运行电脑验证：未运行。
