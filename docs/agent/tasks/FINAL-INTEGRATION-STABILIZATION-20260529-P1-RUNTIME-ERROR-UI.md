任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI
任务名称：Final Integration P1 Runtime Error UI Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P1-RUNTIME-ERROR
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p1-runtime-error-ui
状态：DONE

任务目标：

1. Runtime Monitor / Runs 页面从后端 `/workflow-instances` 读取真实 run list、detail、logs。
2. 前端正确映射后端状态 `PENDING/RUNNING/RETRYING/SUCCESS/FAILED/CANCELLED`。
3. 补齐 loading、empty、error、retry，避免 Gateway/Sentinel 429 或后端错误导致白屏。
4. SSE 断开或 runtime recovery 失败时保留已有 UI 快照并输出可见错误日志。

允许修改文件：

1. frontend/src/api/modules/workflow.ts
2. frontend/src/services/api/runApi.ts
3. frontend/src/stores/runStore.ts
4. frontend/src/pages/runs/RunsPage.vue
5. frontend/src/components/workflow/RunConsole.vue
6. frontend/src/components/run/LogStream.vue
7. frontend/src/i18n/locales/zh-CN.ts
8. frontend/src/i18n/locales/en-US.ts
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

禁止修改文件：

1. backend/**
2. python-ai-service/**
3. Workflow Runtime Core 与后端 Runtime 执行引擎
4. docker-compose.yml
5. frontend/nginx/Dockerfile
6. frontend/.env.example

是否允许新增文件：是，仅允许新增本任务文档。
是否允许修改接口：否。
是否允许修改数据库：否。
是否允许修改配置：否。

Agent 编码计划：

1. 在 `workflow.ts` 增加 `/workflow-instances` list/detail/logs DTO 与 API 函数。
2. 在 `runApi` 做 real-first list/detail/logs，后端不可用时才保留 UI mock fallback。
3. 在 `runStore` 增加 error、logsLoading、refresh/select 错误保护和 runtime recovery 错误日志。
4. 在 `RunsPage`、`LogStream` 与 `RunConsole` 增加 loading、empty、error、retry UI。
5. 同步中英文文案，去掉 Runs 页面 mock-only 描述。

不会修改：

1. 不修改后端源码、DTO、DB、MQ、Redis、Nacos、Gateway。
2. 不修改 Runtime Core 或 SSE 实现。
3. 不修改 Docker 配置。
4. 不把 Whisper/LLM 默认切到 mock。

是否涉及契约变更：否，仅消费已存在后端 `/workflow-instances` 契约。

文件锁范围：

1. frontend/src/api/modules/workflow.ts
2. frontend/src/services/api/runApi.ts
3. frontend/src/stores/runStore.ts
4. frontend/src/pages/runs/RunsPage.vue
5. frontend/src/components/workflow/RunConsole.vue
6. frontend/src/components/run/LogStream.vue
7. frontend/src/i18n/locales/zh-CN.ts
8. frontend/src/i18n/locales/en-US.ts
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P1-RUNTIME-ERROR-UI.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src
4. cd frontend; npm run build
5. 统一运行电脑补测真实 Gateway `/workflow-instances`、Runtime recovery、429/error UI。

当前风险：

1. 本机未启动真实 Gateway/workflow-service，无法完成真实 run query 浏览器联调。
2. 后端 run list 没有 workflowName 字段，前端需使用 definition/runtime id 生成稳定显示名。
3. Mock fallback 仅用于后端不可用时 UI 不白屏，不替代真实 Workflow run 主链路。

## 完成记录

时间：2026-05-29 23:15:00 +08:00
状态：REVIEW

完成内容：

1. `frontend/src/api/modules/workflow.ts` 补齐 `/workflow-instances` list/detail/logs DTO 与 API 函数。
2. `runApi` 改为 real-first 读取后端 run list/detail/logs，并正确映射 Runtime 状态到前端 `queued/running/success/failed/paused`。
3. `runStore` 增加 `error`、`logsLoading`、`refreshRuns`，run list/select/runtime recovery 失败时不抛白屏，保留当前快照并写可见日志。
4. `RunsPage` 增加刷新、loading、error、retry、empty 状态。
5. `RunConsole` 与 `LogStream` 增加 loading/empty 日志状态。
6. 中英文 Runs 文案去掉 mock-only 表述。
7. 未修改 backend、python-ai-service、Docker、Runtime Core、接口、DTO、数据库。

验证记录：

1. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --name-only main...HEAD`：通过，修改范围在本任务文件锁内。
3. `git diff --check main...HEAD`：通过。
4. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src`：通过。无冲突标记输出。

提交：

1. 5eadf43 docs(agent): claim FINAL-INTEGRATION-STABILIZATION-20260529-P1-runtime-error-ui
2. e42819f docs(agent): expand FINAL-INTEGRATION-STABILIZATION-20260529-P1-runtime-error-ui scope
3. 5013cb6 fix(frontend): stabilize runtime run monitor errors

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑补测真实 Gateway `/workflow-instances`、Runtime recovery、SSE reconnect、429/error UI。
2. 后端 run list 当前无 workflowName，前端使用 definition/runtime id 生成显示名。

文件锁：RELEASED。

## Main 合入记录

时间：2026-05-29 23:20:00 +08:00
状态：DONE
分支：main

合入结果：

1. feature 分支已通过 `--no-ff` 合入 main。
2. main merge commit：1d7dc2b。

main 验证记录：

1. `cd frontend; npm run build`：通过。vue-tsc 与 Vite build 通过，仅既有 chunk size warning。
2. `git diff --check HEAD^1..HEAD`：通过。
3. `rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src`：通过。无冲突标记输出。

统一运行电脑验证：未运行。
