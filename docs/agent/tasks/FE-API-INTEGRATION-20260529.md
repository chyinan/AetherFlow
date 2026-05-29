# FE-API-INTEGRATION-20260529

任务ID：FE-API-INTEGRATION-20260529
任务名称：AetherFlow Enterprise Frontend API Integration Layer
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1247-FE-API-INTEGRATION
分支：feature/FE-API-INTEGRATION-20260529-frontend-integration
状态：DONE

## 任务目标

把后端已实现的 Auth、Workflow、Runtime、Node Catalog、File、Notify、AI Provider API 渐进接入 Vue3 前端，建立企业级 API Layer、Token 生命周期、错误归一化、Runtime 实时同步和后端缺口清单。后端未实现但前端需要的接口只统计，不在本任务修改后端。

## 允许修改文件

1. frontend/src/api/**
2. frontend/src/services/api/**
3. frontend/src/services/http/**
4. frontend/src/services/realtime/**
5. frontend/src/stores/**
6. frontend/src/types/**
7. frontend/src/config/**
8. frontend/src/router/index.ts
9. frontend/package.json
10. frontend/package-lock.json
11. frontend/.env.example
12. docs/frontend-backend-missing-apis.md
13. docs/superpowers/plans/2026-05-29-frontend-api-integration.md
14. docs/agent/tasks/FE-API-INTEGRATION-20260529.md
15. docs/agent/logs/2026-05-29.md
16. AGENT.md

## 禁止修改文件

1. backend/**
2. docker/**
3. frontend/src/pages/**，除非真实 API 接入发现必须改页面 glue code，需先记录原因。
4. frontend/src/components/**，除非真实 API 接入发现必须改 upload/realtime glue code，需先记录原因。
5. 数据库、MQ、Redis、Nacos、Gateway、错误码和后端 DTO。

## 权限说明

是否允许新增文件：是。

允许新增位置：

1. frontend/src/api/**
2. frontend/src/services/realtime/**
3. docs/frontend-backend-missing-apis.md
4. docs/superpowers/plans/2026-05-29-frontend-api-integration.md

是否允许修改接口：否。只消费后端现有 OpenAPI / REST / SSE / WebSocket 契约，不修改后端契约。

是否允许修改数据库：否。

是否允许修改配置：仅允许修改 frontend/.env.example、frontend/package.json、frontend/package-lock.json。

## Agent 编码计划

1. 使用 Superpowers 写入实施计划，按计划通过 subagents 串行执行，保持同一时间只有一个代码修改 worker。
2. 建立 frontend/src/api/client 的 tokenManager、apiClient、error normalize、retry、traceId 支持。
3. 建立 frontend/src/api/modules，把 Auth、Workflow、Runtime、Node、File、Notify、AI Provider 分模块接入真实 API，保留 Mock fallback。
4. 通过 mapper 适配后端 DTO 与现有前端类型，避免大规模改页面。
5. 接入 Runtime events / observability 到 runStore，并保留断线后的 REST recovery。
6. 接入 File multipart upload 和 Redis progress polling；后端缺失的 file list / chunk upload 写入缺口清单。
7. 接入 Notify SSE / WebSocket 客户端，支持 reconnect、heartbeat timeout、auto recovery。
8. 统计后端未实现但前端需要的 API 到 docs/frontend-backend-missing-apis.md。
9. 运行 npm run build、git diff --check，记录验证结果和交接。

## 不会修改

1. 不修改后端代码。
2. 不新增或修改 DB / MQ / Redis / Nacos / Gateway 契约。
3. 不把页面层大规模重写为后端 DTO。
4. 不删除 Mock 数据；只通过 API Layer 和 fallback 渐进替换。
5. 不把所有 API 写入单个文件。

## 是否涉及契约变更

否。前端只消费现有契约；后端缺失项写入缺口清单，后续单独开后端补齐任务。

## 文件锁范围

1. frontend/src/api/**
2. frontend/src/services/api/**
3. frontend/src/services/http/**
4. frontend/src/services/realtime/**
5. frontend/src/stores/**
6. frontend/src/types/**
7. frontend/src/config/**
8. frontend/src/router/index.ts
9. frontend/package.json
10. frontend/package-lock.json
11. frontend/.env.example
12. docs/frontend-backend-missing-apis.md
13. docs/superpowers/plans/2026-05-29-frontend-api-integration.md
14. docs/agent/tasks/FE-API-INTEGRATION-20260529.md
15. docs/agent/logs/2026-05-29.md
16. AGENT.md

## 验证方式

1. `npm run build`（工作目录 frontend）。
2. `git diff --check`。
3. 如新增 SDK 生成脚本：`npm run api:generate`。
4. 统一运行电脑补测：Gateway、auth-service、workflow-service、file-service、notify-service、ai-service 真实启动后联调 Auth、Workflow、Runtime、File Upload、SSE、WebSocket。

## 环境检测

1. git：git version 2.53.0.windows.3。
2. java：OpenJDK 17.0.19 Microsoft。
3. maven：Apache Maven 3.9.9；默认 Java 11.0.31，后端测试如需执行必须显式设置 JDK 17。本任务默认不跑后端测试。
4. node：v24.15.0。
5. npm：11.12.1。
6. 操作系统：Microsoft Windows 11 专业工作站版 10.0.26200。
7. 检测时间：2026-05-29 12:47 +08:00。
8. 不能执行的命令：无。
9. 是否需要统一运行电脑补测：是，涉及前后端真实服务链路。

## 当前风险

1. Gateway 当前业务路由未显式包含 `/workflow/**`，Runtime 和 Node Catalog 可能需后端 Gateway 路由补齐；本任务只记录缺口，不修改后端。
2. 原生 EventSource / WebSocket 不能安全携带 Authorization header，前端会优先实现 fetch-SSE 或 token query fallback，并记录后端 stream token / cookie 化需求。
3. 后端 Workflow 当前缺少 list/get/update API，前端工作流列表和已保存定义回读仍需 Mock fallback。
4. 后端 File 当前缺少 file list 和 chunk upload API，前端文件列表与分片上传需求需后续后端任务补齐。
5. 前端节点类型多于后端 Runtime 支持节点，真实运行前需要通过 Node Catalog 限制或映射。

## 执行记录

1. 2026-05-29 12:47，已读取 AGENT.md、docs/COMMON_CONTRACTS.md、frontend-design skill、Superpowers using-superpowers / writing-plans / executing-plans / subagent-driven-development。
2. 2026-05-29 12:47，已创建分支 `feature/FE-API-INTEGRATION-20260529-frontend-integration`。
3. 2026-05-29 12:47，已完成环境检测。
4. 2026-05-29 12:47，当前进行 docs-only claim；claim push 成功前不修改业务代码。
5. 2026-05-29 12:50，docs-only claim 已提交并推送：`3713838 docs(agent): claim FE-API-INTEGRATION-20260529`。
6. 2026-05-29 12:53，已按 Superpowers writing-plans 写入实施计划：`docs/superpowers/plans/2026-05-29-frontend-api-integration.md`。
7. 2026-05-29 14:44，Task 4 完成：接入 File 上传/进度/下载/删除 API、Notify SSE/WebSocket transport、文件上传进度 store wiring；Runtime run log/node state stream 仍保留 scripted mock。
8. 2026-05-29 14:44，验证：`cd frontend; npm run build` 通过；Vite chunk size warning 为既有打包体积提示。
9. 2026-05-29 14:44，已知检查项：本 Task 4 未修改 `frontend/src/router/index.ts`，但该文件已存在于本分支早前提交中，`git diff --name-only origin/main...HEAD` 会继续显示该历史变更。
10. 2026-05-29，Task 5 完成：新增 AI Provider API module、AI Provider mapper，Models facade 改为 `/ai/status` 与 `/ai/provider/**` real-first，`refreshMockProbe()` 优先刷新真实 Provider 数据。
11. 2026-05-29，Task 5 缺口清单完成：新增 `docs/frontend-backend-missing-apis.md`，记录 Workflow/Gateway/Runtime/File/Project/AI/Knowledge/Settings/Copilot 后端 backlog。
12. 2026-05-29，Task 5 验证：`cd frontend; npm run build` 通过；`git diff --check` 通过，仅 Windows LF/CRLF 提示；`git diff --check HEAD^..HEAD` 通过；`git diff --name-only HEAD^..HEAD` 仅包含任务允许范围文件。
13. 2026-05-29 16:11，最终验证：`cd frontend; npm run build` 通过，Vite 仅输出既有 chunk size warning。
14. 2026-05-29 16:11，最终验证：`git diff --check` 通过，无 whitespace error。
15. 2026-05-29 15:58，最终验证：`cd frontend; npm run api:generate` 未通过；原因是本机未启动 Gateway/OpenAPI，`http://localhost:8080/{auth,workflows,ai,files,notify}/v3/api-docs` 均无法解析，需统一运行电脑启动后补测。
16. 2026-05-29 15:58，最终范围检查：`git diff --name-only origin/main...HEAD` 仅包含任务允许的前端 API/Service/Realtime/Store/Types/Config/Router、frontend package/env 与 docs/AGENT 文件。
17. 2026-05-29 16:11，最终 review 修复：补齐 API 401 后的 refresh-token 队列与原请求重放，提交 `4534993 fix(frontend): refresh session on unauthorized api calls`。

## 最终交接

状态：DONE

完成内容：
1. 建立 Enterprise API Integration Layer：Axios client、tokenManager、错误归一化、traceId、retry、401 refresh/replay、OpenAPI/Orval 生成配置。
2. 接入 Auth、Workflow create/start、Runtime REST recovery、Node Catalog、File upload/progress/download/delete、Notify fetch-SSE、可选 WS fallback、AI Provider governance API。
3. 保留缺失后端能力的 Mock fallback：Workflow list/get/update、Run list/detail/log、File list、Runtime streaming 等。
4. 新增 `docs/frontend-backend-missing-apis.md`，为后续后端补齐任务提供 P0/P1/P2 backlog。

验证结果：
1. `cd frontend; npm run build`：通过。
2. `git diff --check`：通过。
3. `cd frontend; npm run api:generate`：未通过，Gateway/OpenAPI 未启动，需统一运行电脑补测。

合入 main：已合入，main 合入提交 `92ced64`。

统一运行电脑验证：未运行。

遗留问题：
1. 需统一运行电脑启动 Gateway 与 auth/workflow/file/notify/ai 服务后补测真实链路。
2. 需后端后续补齐 `docs/frontend-backend-missing-apis.md` 中的 P0/P1 缺口，尤其 `/workflow/**` Gateway route、Workflow list/detail/update、Run list/detail/log、Runtime SSE stream、File list、secure WS stream auth。

文件锁：RELEASED。

## Main 合入记录

时间：2026-05-29 16:50 +08:00

状态：DONE

记录：
1. 已按用户指令将 `feature/FE-API-INTEGRATION-20260529-frontend-integration` 合入 `main`。
2. main 合入提交：`92ced64 merge: frontend api integration layer`。
3. main 上 `cd frontend; npm run build` 通过，Vite 仅输出既有 chunk size warning。
4. main 上 `git diff --check HEAD^1..HEAD` 通过，无 whitespace error。

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：
1. 仍需统一运行电脑补测 Gateway OpenAPI、Auth、Workflow create/start、Runtime recovery、File upload、Notify SSE、AI Provider。
2. `npm run api:generate` 仍需在 Gateway/OpenAPI 可访问后重跑。
