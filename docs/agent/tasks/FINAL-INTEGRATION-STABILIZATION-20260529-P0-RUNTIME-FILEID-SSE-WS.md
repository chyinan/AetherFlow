任务ID：FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS
任务名称：Final Integration P0 Runtime FileId SSE WS Stabilization
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-FINAL-INTEGRATION-P0
分支：feature/FINAL-INTEGRATION-STABILIZATION-20260529-p0-runtime-fileid-sse-ws
状态：IN_PROGRESS

任务目标：

1. 修复 Workflow 运行时未把上传文件 `fileId` 传给后端 `StartWorkflowRequest.input.fileId` 的 P0 问题。
2. 修复前端 run 与后端 workflow runtime id / instance id 贯通，避免 Runtime Monitor、日志和节点状态指向本地 mock id。
3. 将 Runtime 日志订阅从脚本化 mock 事件切换为真实后端 `/workflow/runtime/stream/{workflowId}` SSE，保留显式 fallback。
4. 将 Notify WebSocket 从 `?userId=` 改为使用后端已批准的 `POST /notify/stream-token` + `?streamToken=`。

允许修改文件：

1. frontend/src/api/modules/workflow.ts
2. frontend/src/api/modules/runtime.ts
3. frontend/src/api/modules/notify.ts
4. frontend/src/services/api/workflowApi.ts
5. frontend/src/services/realtime/**
6. frontend/src/stores/runStore.ts
7. frontend/src/stores/fileStore.ts
8. frontend/src/pages/workflows/WorkflowPage.vue
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

禁止修改文件：

1. backend/**
2. docker/**
3. docker-compose.yml
4. frontend/package.json
5. frontend/package-lock.json
6. frontend/src/router/**
7. frontend/src/pages/models/**
8. Workflow Runtime Core 与后端 Runtime 执行引擎

是否允许新增文件：是，仅允许新增本任务文档 `docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md`。
是否允许修改接口：否。仅消费已批准后端契约：`StartWorkflowRequest.input`、`GET /workflow/runtime/stream/{workflowId}`、`POST /notify/stream-token`。
是否允许修改数据库：否。
是否允许修改配置：否。

Agent 编码计划：

1. 检查 WorkflowPage、workflowApi、runStore、fileStore 的上传文件选择与 run 创建链路，确认可用的 backend file id 字段。
2. 修改 startRun 调用，使上传文件 id 进入 `StartWorkflowRequest.input.fileId`，并把后端返回 runtime/instance id 写入前端 run。
3. 修改 realtime client，真实 run 使用 runtime SSE；mock run 或连接失败时只走显式 fallback。
4. 修改 notify API / WebSocket client，连接前获取 stream token，再用 token 建立 WS。
5. 运行前端构建、静态检查、冲突标记扫描和修改范围检查。

不会修改：

1. 不修改后端接口、DTO、DB、MQ、Redis、Nacos、Gateway。
2. 不修改 Runtime Core 调度、节点执行器或 AI Runtime。
3. 不新增大型 UI 功能。
4. 不处理 Docker Demo Safe Mode、AI Failover UI、大文件分片上传；这些拆到后续任务。

是否涉及契约变更：否。使用已合入 main 的后端契约。

文件锁范围：

1. frontend/src/api/modules/workflow.ts
2. frontend/src/api/modules/runtime.ts
3. frontend/src/api/modules/notify.ts
4. frontend/src/services/api/workflowApi.ts
5. frontend/src/services/realtime/**
6. frontend/src/stores/runStore.ts
7. frontend/src/stores/fileStore.ts
8. frontend/src/pages/workflows/WorkflowPage.vue
9. docs/agent/tasks/FINAL-INTEGRATION-STABILIZATION-20260529-P0-RUNTIME-FILEID-SSE-WS.md
10. docs/agent/logs/2026-05-29.md
11. AGENT.md

验证方式：

1. git diff --name-only main...HEAD
2. git diff --check
3. rg -n "^(<<<<<<<|=======|>>>>>>>)" AGENT.md docs/agent/logs/2026-05-29.md frontend/src
4. cd frontend; npm run build
5. 如本机无法启动完整 Gateway/OpenAPI，则记录为需统一运行电脑补测真实 SSE/WS/Workflow run。

当前风险：

1. 前端缺少明确测试 runner，P0 修复主要靠构建、类型检查和统一运行电脑联调验证。
2. 如果现有文件 store 没有稳定保存 backend file id，需要在允许范围内补齐字段传递。
3. Runtime SSE 真实端到端需要后端、Gateway、Nacos、数据库与 runtime event 表在统一运行环境一起验证。

