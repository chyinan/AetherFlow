# BE-GW-WORKFLOW-ROUTE-20260529

任务ID：BE-GW-WORKFLOW-ROUTE-20260529
任务名称：Workflow Runtime / Node API Gateway Route
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1704-BE-GW-WORKFLOW-ROUTE
分支：feature/BE-GW-WORKFLOW-ROUTE-20260529-workflow-route
状态：IN_PROGRESS

## 任务目标

补齐 Gateway `/workflow/**` 业务路由，使前端通过 Gateway 访问 workflow-service 已实现的 Runtime 与 Node API：

1. `GET /workflow/runtime/metrics`
2. `GET /workflow/runtime/observability/{workflowId}`
3. `GET /workflow/runtime/events/{workflowId}`
4. `GET /workflow/node/catalog`
5. `GET /workflow/node/metrics`

本任务只暴露已有 workflow-service API，不修改 workflow-service controller / DTO / service。

## 允许修改文件

1. `backend/gateway-service/src/main/resources/application.yml`
2. `backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java`
3. `docs/agent/tasks/BE-GW-WORKFLOW-ROUTE-20260529.md`
4. `docs/agent/logs/2026-05-29.md`
5. `AGENT.md`

## 禁止修改文件

1. `frontend/**`
2. `backend/workflow-service/**`
3. `backend/common/**`
4. `backend/file-service/**`
5. `backend/ai-service/**`
6. `backend/notify-service/**`
7. `backend/task-service/**`
8. 数据库、Redis、MQ、Nacos 配置和错误码。

## 权限说明

是否允许新增文件：仅允许新增本任务文档，不新增业务代码文件。

是否允许修改接口：是，仅允许新增 Gateway `/workflow/** -> workflow-service` 路由暴露已有 workflow-service API。

是否允许修改数据库：否。

是否允许修改配置：是，仅允许修改 `backend/gateway-service/src/main/resources/application.yml` 中 Gateway route 与 Sentinel workflow-api pattern。

是否允许新增 DTO：否。

是否允许新增 DB：否。

是否允许新增 Redis：否。

是否允许新增 MQ：否。

是否允许修改 Gateway 配置：是，仅本任务目标范围。

## 是否涉及契约变更

是。契约变更已登记到 `AGENT.md`：

1. 类型：Gateway 路由
2. ID：`/workflow/** -> workflow-service`
3. 服务：gateway-service
4. 文件：`backend/gateway-service/src/main/resources/application.yml`
5. 状态：APPROVED

## 文件锁范围

1. `backend/gateway-service/src/main/resources/application.yml`
2. `backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java`
3. `docs/agent/tasks/BE-GW-WORKFLOW-ROUTE-20260529.md`
4. `docs/agent/logs/2026-05-29.md`
5. `AGENT.md`

## Agent 编码计划

1. Claim push 成功前不修改业务代码。
2. 在 `GatewayRouteConfigurationTest` 中先补 `/workflow/runtime/**` 与 `/workflow/node/**` 匹配 workflow-service route 的断言。
3. 更新 `application.yml`，给 workflow-service route 增加 `/workflow/**`，并把 Sentinel `workflow-api` pattern 增加 `/workflow`。
4. 运行 Gateway route contract 测试和静态检查。
5. 更新任务文档、日志、AGENT.md 验证记录与文件锁状态。

## 不会修改

1. 不修改前端代码。
2. 不修改 workflow-service 任何 controller、DTO、service、runtime、node 实现。
3. 不修改 DB / Redis / MQ / Nacos。
4. 不新增业务接口，仅通过 Gateway 暴露 workflow-service 已存在接口。
5. 不直接修改 main。

## 验证方式

1. `git diff --check`
2. `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest test`
3. 如时间允许：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am test`

## 环境检测

1. git：git version 2.53.0.windows.3。
2. Java：OpenJDK 17.0.19 Microsoft。
3. Maven：Apache Maven 3.9.9。
4. OS：Microsoft Windows 11 专业工作站版。
5. 检测时间：2026-05-29 17:04 +08:00。
6. 不能执行的命令：无。
7. 是否需要统一运行电脑补测：是，需要启动 Gateway、Nacos、workflow-service 后补测真实转发链路。

## 执行记录

1. 2026-05-29 17:04，已读取 AGENT.md、docs/COMMON_CONTRACTS.md、docs/frontend-backend-missing-apis.md、FE-API-INTEGRATION-20260529 任务文档、frontend API integration plan、Gateway application.yml 与相关后端 controller/service/test。
2. 2026-05-29 17:04，已确认 `main` 工作区干净，`git pull origin main` 返回 Already up to date。
3. 2026-05-29 17:04，已创建分支 `feature/BE-GW-WORKFLOW-ROUTE-20260529-workflow-route`。
4. 2026-05-29 17:04，当前进行 docs-only claim；claim push 成功前不修改业务代码。
