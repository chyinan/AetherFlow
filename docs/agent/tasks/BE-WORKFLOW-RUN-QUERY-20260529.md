# BE-WORKFLOW-RUN-QUERY-20260529

任务ID：BE-WORKFLOW-RUN-QUERY-20260529
任务名称：Workflow Instance List / Detail / Log Query API
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1728-BE-WORKFLOW-RUN-QUERY
分支：feature/BE-WORKFLOW-RUN-QUERY-20260529-run-query
状态：DONE

## 任务目标

补齐前端 Runs 页面需要的 workflow instance 查询 API：

1. `GET /workflow-instances?workflowId=&status=&page=`
2. `GET /workflow-instances/{id}`
3. `GET /workflow-instances/{id}/logs`

返回运行状态、节点摘要、traceId、timestamps、日志帧。数据来源限定为现有 `af_workflow_instance` 与 `af_workflow_runtime_event`，不改 DB 结构。

## 允许修改文件

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowInstanceController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowInstanceQueryService.java`
3. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java`
4. `backend/workflow-service/src/main/java/com/aetherflow/workflow/dto/WorkflowInstanceRunDtos.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/controller/WorkflowInstanceControllerTest.java`
6. `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java`
7. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
8. `docs/agent/tasks/BE-WORKFLOW-RUN-QUERY-20260529.md`
9. `docs/agent/logs/2026-05-29.md`
10. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/gateway-service/**`
3. `backend/common/**`
4. `backend/workflow-runtime-api/**`
5. `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**`
6. `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java`
7. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowService.java`
8. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java`
9. 数据库、Redis、MQ、Nacos、Gateway 配置和错误码。

## 权限说明

是否允许新增文件：是，仅允许新增本任务列出的 controller、service、dto、test 和任务文档。

是否允许修改接口：是，仅允许新增本任务列出的 workflow instance query REST API。

是否允许修改数据库：否。

是否允许修改配置：否。

是否允许新增 DTO：是，仅 workflow-service 本模块 DTO，不新增 common DTO。

是否允许新增 DB：否。

是否允许新增 Redis：否。

是否允许新增 MQ：否。

是否允许修改 Gateway 配置：否，Gateway 已有 `/workflow-instances/**` route。

## 是否涉及契约变更

是。契约变更已登记到 `AGENT.md`：

1. 类型：REST API
2. ID：`GET /workflow-instances`；`GET /workflow-instances/{id}`；`GET /workflow-instances/{id}/logs`
3. 服务：workflow-service
4. 文件：`backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowInstanceController.java`
5. 状态：APPROVED

## 文件锁范围

1. `backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowInstanceController.java`
2. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowInstanceQueryService.java`
3. `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImpl.java`
4. `backend/workflow-service/src/main/java/com/aetherflow/workflow/dto/WorkflowInstanceRunDtos.java`
5. `backend/workflow-service/src/test/java/com/aetherflow/workflow/controller/WorkflowInstanceControllerTest.java`
6. `backend/workflow-service/src/test/java/com/aetherflow/workflow/service/impl/WorkflowInstanceQueryServiceImplTest.java`
7. `backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java`
8. `docs/agent/tasks/BE-WORKFLOW-RUN-QUERY-20260529.md`
9. `docs/agent/logs/2026-05-29.md`
10. `AGENT.md`

## Agent 编码计划

1. Claim push 成功前不修改业务代码。
2. TDD RED：新增 controller/service/OpenAPI tests，确认 run query API 缺失。
3. GREEN：新增 workflow instance query controller/service/DTO，使用 `WorkflowInstanceMapper` 与 `RuntimeEventStore` 查询。
4. `workflowId` query 参数按现有后端数据模型支持 numeric definitionId / instanceId 查询；非 numeric 参数返回空列表，避免错误映射前端本地 id。
5. 日志帧从 `RuntimeEvent` 派生 level/message/nodeId/traceId/occurredAt/attributes。
6. 节点摘要从 runtime events 聚合 nodeId、status、eventType、timestamps。
7. 运行目标测试、全量 workflow-service 测试、静态检查。
8. 更新任务文档、日志、AGENT.md 验证记录与文件锁状态。

## 不会修改

1. 不修改前端代码。
2. 不修改 Gateway。
3. 不修改 workflow runtime engine / runtime API。
4. 不修改 DB 结构。
5. 不新增 common DTO。
6. 不直接修改 main。

## 验证方式

1. `git diff --check`
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowInstanceControllerTest,WorkflowInstanceQueryServiceImplTest,WorkflowOpenApiContractTest '-Dsurefire.failIfNoSpecifiedTests=false' test`
3. 如时间允许：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`

## 环境检测

1. git：git version 2.53.0.windows.3。
2. Java：OpenJDK 17.0.19 Microsoft。
3. Maven：Apache Maven 3.9.9。
4. OS：Microsoft Windows 11 专业工作站版。
5. 检测时间：2026-05-29 17:28 +08:00。
6. 不能执行的命令：无。
7. 是否需要统一运行电脑补测：是，需要启动 workflow-service、MySQL 后补测真实 run query 与 runtime event 聚合。

## 执行记录

1. 2026-05-29 17:28，已从最新 `main` 创建分支 `feature/BE-WORKFLOW-RUN-QUERY-20260529-run-query`。
2. 2026-05-29 17:28，已确认目标文件锁无 ACTIVE 冲突。
3. 2026-05-29 17:28，当前进行 docs-only claim；claim push 成功前不修改业务代码。
4. 2026-05-29 17:33，TDD RED 已确认：目标测试因缺少 `WorkflowInstanceController`、`WorkflowInstanceQueryService`、`WorkflowInstanceRunDtos` 编译失败。
5. 2026-05-29 17:37，已新增 workflow instance query controller/service/DTO 与 controller/service/OpenAPI contract tests。
6. 2026-05-29 17:38，业务提交：`5b0fbef feat(workflow): add instance run query APIs`。

## 完成内容

1. 新增 `GET /workflow-instances`，支持 `workflowId`、`status`、`page`、`pageSize` 查询。
2. 新增 `GET /workflow-instances/{id}`，返回 run detail、traceId、timestamps、duration、node summaries。
3. 新增 `GET /workflow-instances/{id}/logs`，从 `RuntimeEventStore` 派生前端可消费的 log frames。
4. 新增 workflow-service 本模块 `WorkflowInstanceRunDtos`，不新增 common DTO。
5. 未改 DB、Redis、MQ、Gateway、runtime engine、workflow-runtime-api。

## 验证结果

1. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=WorkflowInstanceControllerTest,WorkflowInstanceQueryServiceImplTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过；8 tests；BUILD SUCCESS。
3. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am test`：通过；common 8 tests；workflow-runtime-api 10 tests；workflow-service 101 tests；BUILD SUCCESS。
4. `git diff --cached --check`：通过，无 whitespace error。

## 交接

分支：`feature/BE-WORKFLOW-RUN-QUERY-20260529-run-query`

提交：
1. `752126e docs(agent): claim BE-WORKFLOW-RUN-QUERY-20260529`
2. `5b0fbef feat(workflow): add instance run query APIs`

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：
1. 需统一运行电脑启动 workflow-service、MySQL 后补测真实 `af_workflow_instance` 与 `af_workflow_runtime_event` 聚合。
2. 当前 `workflowId` 查询按现有后端数据模型仅支持 numeric definitionId / instanceId；前端本地字符串 id 的映射需要后续设计正式定义字段或项目/workspace 维度。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：12dcd4e merge: backend workflow run query。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
