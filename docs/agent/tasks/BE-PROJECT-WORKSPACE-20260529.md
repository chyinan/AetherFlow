任务ID：BE-PROJECT-WORKSPACE-20260529
任务名称：Project / Workspace API Backend Gap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1848-BE-PROJECT-WORKSPACE
分支：feature/BE-PROJECT-WORKSPACE-20260529-project-workspace
状态：DONE

## 任务目标

补齐 FE-API-INTEGRATION-20260529 暴露的 Project / Workspace 后端缺口，提供前端项目首页和工作区导航可接入的最小持久化闭环：

1. `GET /projects`
2. `POST /projects`
3. `GET /projects/{id}`
4. `PUT /projects/{id}`
5. `DELETE /projects/{id}`
6. `GET /projects/{id}/stats`
7. `GET /workspaces`
8. `POST /workspaces`
9. `GET /workspaces/{id}`
10. `PUT /workspaces/{id}`
11. `DELETE /workspaces/{id}`

本任务将 Project / Workspace 放在 workflow-service 内实现，因为项目是 Workflow Builder、Run 和项目首页的上层组织域；Gateway 仅补 `/projects/**` 与 `/workspaces/**` 路由到 workflow-service。

## 允许修改文件

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/controller/ProjectWorkspaceController.java
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/dto/ProjectWorkspaceDtos.java
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/entity/ProjectEntity.java
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/entity/WorkspaceEntity.java
5. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/mapper/ProjectMapper.java
6. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/mapper/WorkspaceMapper.java
7. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/service/ProjectWorkspaceService.java
8. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/service/impl/ProjectWorkspaceServiceImpl.java
9. backend/workflow-service/src/main/resources/db/project-workspace.sql
10. docker/mysql/init/01-aetherflow.sql
11. backend/workflow-service/src/test/java/com/aetherflow/workflow/project/controller/ProjectWorkspaceControllerTest.java
12. backend/workflow-service/src/test/java/com/aetherflow/workflow/project/service/ProjectWorkspaceServiceImplTest.java
13. backend/workflow-service/src/test/java/com/aetherflow/workflow/project/db/ProjectWorkspaceSchemaTest.java
14. backend/gateway-service/src/main/resources/application.yml
15. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
16. docs/agent/tasks/BE-PROJECT-WORKSPACE-20260529.md
17. docs/agent/logs/2026-05-29.md
18. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/common/**
3. backend/auth-service/**
4. backend/file-service/**
5. backend/ai-service/**
6. backend/notify-service/**
7. backend/task-service/**
8. backend/workflow-runtime-api/**
9. backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java
10. backend/workflow-service/src/main/java/com/aetherflow/workflow/service/WorkflowService.java
11. backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java
12. backend/workflow-service/src/main/java/com/aetherflow/workflow/entity/WorkflowDefinition.java
13. backend/workflow-service/src/main/java/com/aetherflow/workflow/entity/WorkflowInstance.java
14. backend/workflow-service/src/main/resources/application.yml
15. pom.xml / backend/*/pom.xml
16. Nacos / Redis / MQ 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/project/**
3. backend/workflow-service/src/main/resources/db/project-workspace.sql
4. docs/agent/tasks/BE-PROJECT-WORKSPACE-20260529.md

是否允许修改接口：是，仅允许新增 `/projects/**` 与 `/workspaces/**` REST API。

是否允许新增 DTO：是，仅允许 workflow-service 内部 `ProjectWorkspaceDtos`。

是否允许修改数据库：是，仅允许新增 `af_workspace`、`af_project` 表定义，并同步 `docker/mysql/init/01-aetherflow.sql`。

是否允许修改 Redis：否。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：是，仅允许新增 `/projects/**`、`/workspaces/** -> workflow-service` route 和 workflow-api Sentinel pattern。

## Agent 编码计划

1. 先补 controller/service/schema/gateway 目标测试，让缺失类、缺失 route 和缺失 SQL 进入 Red。
2. 新增 Project / Workspace entity、mapper、DTO、service 和 controller。
3. `GET /projects` 使用 `PageResult<ProjectSummary>`，支持 `query`、`workspaceId`、`status`、`page`、`size`。
4. `GET /projects/{id}` 返回前端 `ProjectSummary` 可映射字段，`GET /projects/{id}/stats` 返回统计字段。
5. `GET /workspaces` 使用 `PageResult<WorkspaceSummary>`，支持 `query`、`page`、`size`。
6. 新增 workflow-service SQL 和 docker mysql init SQL。
7. Gateway 增加 `/projects/**`、`/workspaces/**` 路由，并更新 route contract 测试。
8. 运行目标测试与相关模块测试。
9. 收工更新任务、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改前端代码。
2. 不修改既有 Workflow create/start、Runtime、Node Catalog API。
3. 不给 `af_workflow_definition` 或 `af_workflow_instance` 增加字段。
4. 不新增 Redis Key、MQ Event、Nacos 配置。
5. 不新增 Maven 依赖。
6. 不实现 Settings member/billing/audit API；这些留给后续 Settings/Admin 任务。

## 是否涉及契约变更

是。

1. 新增 Project REST API：`/projects/**`。
2. 新增 Workspace REST API：`/workspaces/**`。
3. 新增 workflow-service 内部 DTO：`ProjectWorkspaceDtos`。
4. 新增 DB 表：`af_workspace`、`af_project`。
5. 新增 Gateway 路由：`/projects/**`、`/workspaces/** -> workflow-service`。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/project/**
3. backend/workflow-service/src/main/resources/db/project-workspace.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-PROJECT-WORKSPACE-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=ProjectWorkspaceControllerTest,ProjectWorkspaceServiceImplTest,ProjectWorkspaceSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
5. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service,backend/gateway-service -am test

## 当前风险

1. 本任务不把 Project 与现有 WorkflowDefinition 做 DB 外键绑定，因此项目统计先由 `af_project` 自身字段承载，后续可在 Workflow definition CRUD 合入主线后增加关联字段。
2. Workspace member 只提供 owner/memberCount 上下文字段，不实现成员管理；成员管理属于后续 Settings/Admin API 任务。
3. 新增 DB 表需要统一运行电脑应用 `docker/mysql/init/01-aetherflow.sql` 或 `backend/workflow-service/src/main/resources/db/project-workspace.sql` 后再联调。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 18:48 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，需补测 Gateway 路由、workflow-service 启动、真实 MySQL 表初始化和项目首页 API 链路

## Claim 记录

1. 2026-05-29 18:48，从 main 创建 feature/BE-PROJECT-WORKSPACE-20260529-project-workspace。
2. 2026-05-29 18:48，已检查 AGENT.md 文件锁表，目标 project/workspace、Gateway route、docker init 文件未发现 ACTIVE 冲突。
3. 2026-05-29 18:48，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 19:00 +08:00

完成内容：

1. workflow-service 新增 `/projects` list/create、`/projects/{id}` detail/update/delete、`/projects/{id}/stats`。
2. workflow-service 新增 `/workspaces` list/create、`/workspaces/{id}` detail/update/delete。
3. 新增 `ProjectWorkspaceDtos`、Project/Workspace entity、mapper、service 和 controller。
4. 新增 `af_workspace`、`af_project` SQL，并同步 `docker/mysql/init/01-aetherflow.sql`。
5. Gateway route 将 `/projects`、`/projects/**`、`/workspaces`、`/workspaces/**` 转发到 workflow-service，并加入 workflow-api Sentinel pattern。
6. 补齐 controller/service/schema/gateway route contract 测试。

验证记录：

1. TDD Red：实现前 workflow-service 目标测试因缺少 Project/Workspace 类编译失败；GatewayRouteConfigurationTest 因缺少 `/projects`/`/workspaces` route 失败，符合预期。
2. workflow-service 目标测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=ProjectWorkspaceControllerTest,ProjectWorkspaceServiceImplTest,ProjectWorkspaceSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test` 通过；11 tests。
3. gateway-service 目标测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test` 通过；5 tests。
4. 相关模块测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service,backend/gateway-service -am test` 通过；common 8 tests，workflow-runtime-api 10 tests，gateway-service 17 tests，workflow-service 105 tests。
5. 静态检查：`git diff --check` 通过，无 whitespace error，仅 Windows LF/CRLF 提示。

提交：

1. e27a656 docs(agent): claim BE-PROJECT-WORKSPACE-20260529
2. 13c2927 feat(workflow): add project workspace APIs

状态：DONE

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑补测 Gateway 路由、workflow-service 启动、真实 MySQL 表初始化和项目首页 API 链路。
2. 当前项目统计由 `af_project` 自身字段承载，暂未与 WorkflowDefinition/WorkflowInstance 表做关联；后续 Workflow definition CRUD 合入后可补项目关联。
3. Workspace member 管理、billing、audit 仍属于后续 Settings/Admin API 任务。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：fe94377 merge: backend project workspace。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
