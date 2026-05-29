# BE-WORKFLOW-DEFINITION-CRUD-20260529

任务ID：BE-WORKFLOW-DEFINITION-CRUD-20260529
任务名称：Workflow Definitions List / Detail / Update / Delete API
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1715-BE-WORKFLOW-DEFINITION-CRUD
分支：feature/BE-WORKFLOW-DEFINITION-CRUD-20260529-definition-crud
状态：DONE

## 任务目标

补齐 Workflow Builder 持久化回读需要的 workflow definition CRUD API：

1. `GET /workflows/definitions`
2. `GET /workflows/definitions/{id}`
3. `PUT /workflows/definitions/{id}`
4. `DELETE /workflows/definitions/{id}`

本任务不得破坏现有 `POST /workflows/definitions` 和 `POST /workflows/definitions/{definitionId}/instances`。

## 允许修改文件

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowService.java`
3. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
4. `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowServiceImplTest.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/controller/WorkflowControllerTest.java`
6. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
7. `docs/agent/tasks/BE-WORKFLOW-DEFINITION-CRUD-20260529.md`
8. `docs/agent/logs/2026-05-29.md`
9. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/gateway-service/**`
3. `backend/common/**`
4. `backend/workflow-runtime-api/**`
5. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**`
6. `backend/file-service/**`
7. `backend/ai-service/**`
8. `backend/notify-service/**`
9. 数据库、Redis、MQ、Nacos、Gateway 配置和错误码。

## 权限说明

是否允许新增文件：是，仅允许新增 `backend/workflow-service/src/test/java/com/aetherflow/workflow/controller/WorkflowControllerTest.java` 和本任务文档。

是否允许修改接口：是，仅允许新增本任务列出的 workflow definition CRUD REST API。

是否允许修改数据库：否，沿用 `af_workflow_definition` 表和 `status` 字段软删除。

是否允许修改配置：否。

是否允许新增 DTO：否，本任务沿用 `WorkflowDefinitionDTO` request 与 `WorkflowDefinition` response，避免扩大 common 契约。

是否允许新增 DB：否。

是否允许新增 Redis：否。

是否允许新增 MQ：否。

是否允许修改 Gateway 配置：否。

## 是否涉及契约变更

是。契约变更已登记到 `AGENT.md`：

1. 类型：REST API
2. ID：`GET /workflows/definitions`；`GET /workflows/definitions/{id}`；`PUT /workflows/definitions/{id}`；`DELETE /workflows/definitions/{id}`
3. 服务：workflow-service
4. 文件：`backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java`
5. 状态：APPROVED

## 文件锁范围

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowService.java`
3. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
4. `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowServiceImplTest.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/controller/WorkflowControllerTest.java`
6. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
7. `docs/agent/tasks/BE-WORKFLOW-DEFINITION-CRUD-20260529.md`
8. `docs/agent/logs/2026-05-29.md`
9. `AGENT.md`

## Agent 编码计划

1. Claim push 成功前不修改业务代码。
2. TDD RED：新增 controller/service/OpenAPI tests，先确认 list/detail/update/delete 缺失。
3. GREEN：在 controller/service/service impl 中补最小实现。
4. 删除采用 `status=DELETED` 软删除，list/detail/update 不返回已删除定义。
5. 更新 Swagger/OpenAPI contract test，保证新增 endpoint 有 `@Operation` / `@ApiResponse`。
6. 运行目标测试、全量 workflow-service 测试、静态检查。
7. 更新任务文档、日志、AGENT.md 验证记录与文件锁状态。

## 不会修改

1. 不修改前端代码。
2. 不修改 Gateway。
3. 不修改 workflow runtime engine / runtime API。
4. 不修改 DB 结构。
5. 不新增 common DTO。
6. 不直接修改 main。

## 验证方式

1. `git diff --check`
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowControllerTest,WorkflowServiceImplTest,WorkflowOpenApiContractTest '-Dsurefire.failIfNoSpecifiedTests=false' test`
3. 如时间允许：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`

## 环境检测

1. git：git version 2.53.0.windows.3。
2. Java：OpenJDK 17.0.19 Microsoft。
3. Maven：Apache Maven 3.9.9。
4. OS：Microsoft Windows 11 专业工作站版。
5. 检测时间：2026-05-29 17:15 +08:00。
6. 不能执行的命令：无。
7. 是否需要统一运行电脑补测：是，需要启动 workflow-service 和 MySQL 后补测真实 CRUD 持久化。

## 执行记录

1. 2026-05-29 17:15，已从最新 `main` 创建分支 `feature/BE-WORKFLOW-DEFINITION-CRUD-20260529-definition-crud`。
2. 2026-05-29 17:15，已确认目标文件锁无 ACTIVE 冲突。
3. 2026-05-29 17:15，当前进行 docs-only claim；claim push 成功前不修改业务代码。
4. 2026-05-29 17:15，docs-only claim 已提交并推送：`8ea899d docs(agent): claim BE-WORKFLOW-DEFINITION-CRUD-20260529`。
5. 2026-05-29 17:21，TDD RED：新增 controller/service/OpenAPI tests 后目标测试编译失败，缺少 `listDefinitions`、`getDefinition`、`updateDefinition`、`deleteDefinition`。
6. 2026-05-29 17:22，GREEN：补齐 controller/service/service impl 后目标测试通过。

## 完成内容

1. 新增 `GET /workflows/definitions`，返回非 DELETED workflow definitions。
2. 新增 `GET /workflows/definitions/{id}`，返回单个 definition detail，包括 `definitionJson`。
3. 新增 `PUT /workflows/definitions/{id}`，按 `WorkflowDefinitionDTO` 更新 name、description、definitionJson，并递增 version。
4. 新增 `DELETE /workflows/definitions/{id}`，通过 `status=DELETED` 软删除，不改 DB 表结构。
5. `startInstance` 复用 definition 存在性检查，已软删除 definition 不允许启动。
6. 新增 `WorkflowControllerTest`，覆盖 list/detail/update/delete HTTP contract。
7. 扩展 `WorkflowServiceImplTest`，覆盖 list/detail/update/delete service 行为。
8. 扩展 `WorkflowOpenApiContractTest`，覆盖新增 API 的 `@Operation` / `@ApiResponse`。

## 验证结果

1. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowControllerTest,WorkflowServiceImplTest,WorkflowOpenApiContractTest '-Dsurefire.failIfNoSpecifiedTests=false' test`：通过，12 tests；BUILD SUCCESS。
3. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`：通过，common 8 tests；workflow-runtime-api 10 tests；workflow-service 103 tests；BUILD SUCCESS。

## 最终交接

状态：DONE

提交：
1. `8ea899d docs(agent): claim BE-WORKFLOW-DEFINITION-CRUD-20260529`
2. `feat(workflow): add definition crud APIs`

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：
1. 需统一运行电脑启动 workflow-service 和 MySQL 后补测真实 CRUD 持久化。
2. `GET /workflow-instances`、`GET /workflow-instances/{id}`、`GET /workflow-instances/{id}/logs` 仍待后续 P0 任务。
3. 本任务未新增 definition owner 字段，因当前 `af_workflow_definition` 表无 owner/user 字段；后续如需 workspace ownership 需单独 DB/契约任务。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：9d81eaa merge: backend workflow definition crud。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
