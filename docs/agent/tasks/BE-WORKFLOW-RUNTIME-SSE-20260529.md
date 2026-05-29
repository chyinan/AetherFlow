# BE-WORKFLOW-RUNTIME-SSE-20260529

任务ID：BE-WORKFLOW-RUNTIME-SSE-20260529
任务名称：Workflow Runtime SSE Event Stream
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1742-BE-WORKFLOW-RUNTIME-SSE
分支：feature/BE-WORKFLOW-RUNTIME-SSE-20260529-runtime-sse
状态：DONE

## 任务目标

补齐前端 Runtime node/log stream 所需的 workflow runtime SSE：

1. `GET /workflow/runtime/stream/{workflowId}`
2. `Content-Type: text/event-stream`
3. 事件 payload 兼容现有 `RuntimeEvent` REST shape。
4. 支持 heartbeat。
5. 支持断线恢复：`Last-Event-ID` header 或 `cursor` query 参数。

本任务只补 workflow-service 运行时事件流，不改 Gateway。Gateway `/workflow/**` route 已在独立 P0 任务 `BE-GW-WORKFLOW-ROUTE-20260529` 中完成。

## 允许修改文件

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java`
3. `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeControllerTest.java`
4. `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamServiceTest.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
6. `docs/agent/tasks/BE-WORKFLOW-RUNTIME-SSE-20260529.md`
7. `docs/agent/logs/2026-05-29.md`
8. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/gateway-service/**`
3. `backend/common/**`
4. `backend/workflow-runtime-api/**`
5. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/**`
6. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/**`
7. `backend/workflow-service/src/main/resources/**`
8. 数据库、Redis、MQ、Nacos、Gateway 配置和错误码。

## 权限说明

是否允许新增文件：是，仅允许新增 `RuntimeEventStreamService` 与其测试、任务文档。

是否允许修改接口：是，仅允许新增 `GET /workflow/runtime/stream/{workflowId}` SSE API。

是否允许修改数据库：否。

是否允许修改配置：否。

是否允许新增 DTO：否，SSE payload 复用 `RuntimeEvent`。

是否允许新增 DB：否。

是否允许新增 Redis：否。

是否允许新增 MQ：否。

是否允许修改 Gateway 配置：否。

## 是否涉及契约变更

是。契约变更已登记到 `AGENT.md`：

1. 类型：REST SSE API
2. ID：`GET /workflow/runtime/stream/{workflowId}`
3. 服务：workflow-service
4. 文件：`backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java`
5. 状态：APPROVED

## 文件锁范围

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java`
3. `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/controller/WorkflowRuntimeControllerTest.java`
4. `backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamServiceTest.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
6. `docs/agent/tasks/BE-WORKFLOW-RUNTIME-SSE-20260529.md`
7. `docs/agent/logs/2026-05-29.md`
8. `AGENT.md`

## Agent 编码计划

1. Claim push 成功前不修改业务代码。
2. TDD RED：新增 controller/service/OpenAPI tests，确认 runtime stream API 缺失。
3. GREEN：新增 `RuntimeEventStreamService`，通过轮询 `RuntimeEventStore` 输出新增 `RuntimeEvent`。
4. 使用 SSE event name `runtime-event`，event id 使用 `RuntimeEvent.eventId`，data 复用 `RuntimeEvent`。
5. heartbeat 使用 SSE event name `heartbeat`，返回 workflowId、cursor、occurredAt。
6. `cursor` query 参数优先于 `Last-Event-ID` header；cursor 命中时只发送之后的事件，cursor 不存在时回放当前全部事件以避免漏事件。
7. 运行目标测试、全量 workflow-service 测试、静态检查。
8. 更新任务文档、日志、AGENT.md 验证记录与文件锁状态。

## 不会修改

1. 不修改前端代码。
2. 不修改 Gateway。
3. 不修改 runtime engine。
4. 不修改 RuntimeEvent / workflow-runtime-api 协议。
5. 不修改 DB / Redis / MQ / Nacos / application.yml。
6. 不直接修改 main。

## 验证方式

1. `git diff --check`
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeControllerTest,RuntimeEventStreamServiceTest,WorkflowOpenApiContractTest '-Dsurefire.failIfNoSpecifiedTests=false' test`
3. 如时间允许：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`

## 环境检测

1. git：git version 2.53.0.windows.3。
2. Java：OpenJDK 17.0.19 Microsoft。
3. Maven：Apache Maven 3.9.9。
4. OS：Microsoft Windows 11 专业工作站版。
5. 检测时间：2026-05-29 17:42 +08:00。
6. 不能执行的命令：无。
7. 是否需要统一运行电脑补测：是，需要启动 workflow-service、MySQL 后验证真实 SSE reconnect / Last-Event-ID。

## 执行记录

1. 2026-05-29 17:42，已从最新 `main` 创建分支 `feature/BE-WORKFLOW-RUNTIME-SSE-20260529-runtime-sse`。
2. 2026-05-29 17:42，已确认目标文件锁无 ACTIVE 冲突。
3. 2026-05-29 17:42，当前进行 docs-only claim；claim push 成功前不修改业务代码。
4. 2026-05-29 17:48，TDD RED 已确认：目标测试因缺少 `RuntimeEventStreamService` 编译失败。
5. 2026-05-29 17:50，已新增 Runtime SSE controller endpoint、stream service、cursor/heartbeat 逻辑与测试。
6. 2026-05-29 17:51，业务提交：`418284e feat(workflow): add runtime event sse stream`。

## 完成内容

1. 新增 `GET /workflow/runtime/stream/{workflowId}`，返回 `text/event-stream`。
2. SSE `runtime-event` 使用 `RuntimeEvent.eventId` 作为 event id，payload 复用 `RuntimeEvent`。
3. 新增 heartbeat 事件，包含 workflowId、cursor、occurredAt。
4. 支持 `Last-Event-ID` header 和 `cursor` query 参数恢复；`cursor` 优先。
5. 使用已有 `RuntimeEventStore` 轮询持久化事件，不改 DB、Redis、MQ、Gateway 或 runtime engine。

## 验证结果

1. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeControllerTest,RuntimeEventStreamServiceTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过；9 tests；BUILD SUCCESS。
3. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`：通过；common 8 tests；workflow-runtime-api 10 tests；workflow-service 99 tests；BUILD SUCCESS。
4. `git diff --cached --check`：通过，无 whitespace error。

## 交接

分支：`feature/BE-WORKFLOW-RUNTIME-SSE-20260529-runtime-sse`

提交：
1. `eadeaad docs(agent): claim BE-WORKFLOW-RUNTIME-SSE-20260529`
2. `418284e feat(workflow): add runtime event sse stream`

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：
1. 需统一运行电脑补测真实 workflow-service + MySQL 下的 SSE 连接、heartbeat、Last-Event-ID reconnect。
2. 本任务未修改 Gateway；必须与 `BE-GW-WORKFLOW-ROUTE-20260529` 合入后，前端才能经 Gateway 访问 `/workflow/runtime/stream/{workflowId}`。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：ed506e3 merge: backend workflow runtime sse。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
