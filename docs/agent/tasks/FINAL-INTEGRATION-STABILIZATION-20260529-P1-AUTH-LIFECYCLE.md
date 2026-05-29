任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE
任务名称：Final Integration P1 Auth Lifecycle Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-AUTH
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-auth-lifecycle
状态：IN_PROGRESS

任务目标：

1. 处理全局 `aetherflow:unauthorized` 事件，refresh 失败后清理本地状态并回登录页。
2. tokenManager 在 localStorage 不可用时保留内存 session，避免演示浏览器隐私策略导致登录后请求无 token。
3. 登录页文案从 mock-only 改为 demo account / backend-first fallback，避免误导主线演示。

允许修改文件：

1. frontend/src/main.ts
2. frontend/src/api/client/tokenManager.ts
3. frontend/src/i18n/locales/zh-CN.ts
4. frontend/src/i18n/locales/en-US.ts
5. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE.md
6. docs/agent/logs/2026-05-29.md
7. AGENT.md

禁止修改文件：

1. backend/**
2. python-ai-service/**
3. frontend/src/api/modules/auth.ts
4. frontend/src/services/api/authApi.ts
5. frontend/src/stores/authStore.ts
6. docker-compose.yml

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否。
是否允许修改数据库：否。
是否允许修改配置：否。

Agent 编码计划：

1. `tokenManager` 增加内存 session fallback，并在 set/clear/read 时与 localStorage 保持一致。
2. `main.ts` 注册 `aetherflow:unauthorized` 监听器，清理 session 并带 redirect 返回 `/login`。
3. 修改中英文登录页 auth 文案，表达真实后端优先、仅后端不可用时 demo fallback。

不会修改：

1. 不修改后端 Auth 接口与 DTO。
2. 不修改 refresh/login API 调用契约。
3. 不修改 Route 定义结构。
4. 不修改 Whisper/LLM 主线链路。

是否涉及契约变更：否。

文件锁范围：

1. frontend/src/main.ts
2. frontend/src/api/client/tokenManager.ts
3. frontend/src/i18n/locales/zh-CN.ts
4. frontend/src/i18n/locales/en-US.ts
5. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AUTH-LIFECYCLE.md
6. docs/agent/logs/2026-05-29.md
7. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src
4. cd frontend; npm run build
5. 统一运行电脑补测真实 login、refresh、401 refresh failure redirect。

当前风险：

1. 本机未启动真实 auth-service，无法完成真实 JWT refresh 端到端。
2. 默认 demo account fallback 仍依赖 `VITE_MOCK_FALLBACK=true`，生产环境需关闭。
