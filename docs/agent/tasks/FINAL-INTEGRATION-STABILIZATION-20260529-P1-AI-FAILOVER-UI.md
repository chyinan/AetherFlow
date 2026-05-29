任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI
任务名称：Final Integration P1 AI Failover UI Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-AI-FAILOVER
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-ai-failover-ui
状态：DONE

任务目标：

1. Models 页面从后端 AI Provider 契约读取真实 catalog、status、policy、metrics、logs。
2. 前端正确展示 OpenAI fail、Ollama fallback、Provider switch/recover 状态和日志。
3. 补齐 loading、error、retry、mock fallback 标识，避免演示时白屏或按钮无反应。
4. 保持 Whisper/LLM 主线真实运行，不新增主链路 mock。

允许修改文件：

1. frontend/src/api/modules/ai.ts
2. frontend/src/api/mappers/aiMapper.ts
3. frontend/src/services/api/modelApi.ts
4. frontend/src/stores/modelStore.ts
5. frontend/src/pages/models/ModelsPage.vue
6. frontend/src/types/model.ts
7. frontend/src/i18n/locales/zh-CN.ts
8. frontend/src/i18n/locales/en-US.ts
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

禁止修改文件：

1. backend/**
2. python-ai-service/**
3. docker-compose.yml
4. frontend/nginx/Dockerfile
5. frontend/.env.example
6. Workflow Runtime Core 与后端 Runtime 执行引擎

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否。
是否允许修改数据库：否。
是否允许修改配置：否。

Agent 编码计划：

1. 扩展 `frontend/src/api/modules/ai.ts` 类型与函数，消费 `/ai/provider/catalog` 和 `/ai/provider/logs?limit=`。
2. 调整 `aiMapper` 合并 catalog/status/policy/metrics/logs，消除 `contract pending` 与 mock-only 状态。
3. 调整 `modelApi` 一次性加载真实 snapshot；后端不可用时仍只作为 UI fallback，不影响 Whisper/LLM 主链路。
4. 调整 `modelStore` 增加 error、source、recover、provider switch 行为。
5. 调整 `ModelsPage.vue` 显示真实/回退来源、加载/error/retry、recover、设为主路由。
6. 同步中英文文案，去掉 mock-only 描述。

不会修改：

1. 不修改后端源码、DTO、DB、MQ、Redis、Nacos、Gateway。
2. 不修改 Runtime Core 或 workflow 执行链路。
3. 不修改 Docker 配置。
4. 不把 Whisper/LLM 默认切到 mock。

是否涉及契约变更：否，仅消费已存在后端契约。

文件锁范围：

1. frontend/src/api/modules/ai.ts
2. frontend/src/api/mappers/aiMapper.ts
3. frontend/src/services/api/modelApi.ts
4. frontend/src/stores/modelStore.ts
5. frontend/src/pages/models/ModelsPage.vue
6. frontend/src/types/model.ts
7. frontend/src/i18n/locales/zh-CN.ts
8. frontend/src/i18n/locales/en-US.ts
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-AI-FAILOVER-UI.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src
4. cd frontend; npm run build
5. 统一运行电脑补测真实 Gateway `/ai/provider/**`、OpenAI fail -> Ollama fallback、Provider switch/recover。

当前风险：

1. 本机未启动真实 Gateway/ai-service，无法完成浏览器端真实服务联调。
2. 若后端无近期 AIInferenceLog，日志区只能展示空态，需 demo 前触发一次真实 Summary/LLM 请求。
3. Mock fallback 仅用于后端不可用时 UI 不白屏，不替代 Whisper/LLM 主线演示。

## 完成记录

时间：2026-05-29 22:50:00 +08:00
状态：REVIEW

完成内容：

1. `frontend/src/api/modules/ai.ts` 补齐 `/ai/provider/catalog`、`/ai/provider/logs?limit=`、`requestTimeout` 与 catalog/log DTO 类型。
2. `aiMapper` 合并真实 catalog、status、policy、metrics、logs，去掉 Models 页 `contract pending`/mock-only 映射。
3. `modelApi` 一次性拉取真实 AI Provider snapshot，并提供 `recoverProvider` 与 `switchPrimaryProvider`。
4. `modelStore` 增加 loading、error、operationError、recover、provider switch 状态；失败时保留已有快照并写 UI 日志。
5. `ModelsPage.vue` 增加真实/安全回退来源 badge、error/retry、空态、设为主路由、恢复熔断、health/circuit/provider order 展示。
6. 中英文文案去掉 Models 页 mock-only 表述。
7. 未修改 backend、python-ai-service、Docker、Runtime Core、接口、DTO、数据库。

验证记录：

1. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --name-only main...HEAD`：通过，修改范围在本任务文件锁内。
3. `git diff --check main...HEAD`：通过。
4. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src`：通过。无冲突标记输出。

提交：

1. 27fd196 docs(agent): claim FINAL-INTEGRATION-STABILIZATION-20260529-P1-ai-failover-ui
2. 2b60a28 fix(frontend): stabilize ai failover models ui

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑补测真实 Gateway `/ai/provider/**`、OpenAI fail -> Ollama fallback、Provider switch/recover。
2. 若无真实 AIInferenceLog，Demo 前需先跑一次 Summary/LLM 请求产生日志。

文件锁：RELEASED。

## Main 合入记录

时间：2026-05-29 22:55:00 +08:00
状态：DONE
分支：main

合入结果：

1. feature 分支已通过 `--no-ff` 合入 main。
2. main merge commit：bf78f76。

main 验证记录：

1. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --check HEAD^1..HEAD`：通过。
3. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src`：通过。无冲突标记输出。

统一运行电脑验证：未运行。
