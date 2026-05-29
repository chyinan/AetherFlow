任务ID：BE-SETTINGS-ADMIN-20260529
任务名称：Settings Admin API Backend Gap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1925-BE-SETTINGS-ADMIN
分支：feature/BE-SETTINGS-ADMIN-20260529-settings-admin
状态：DONE

## 任务目标

补齐 FE-API-INTEGRATION-20260529 暴露的 Settings/admin 后端缺口，在 auth-service 提供前端设置页可接入的最小组织配置、成员、账单和审计接口：

1. `GET /settings/profile`
2. `PUT /settings/profile`
3. `GET /settings/members`
4. `POST /settings/members`
5. `PATCH /settings/members/{id}`
6. `DELETE /settings/members/{id}`
7. `GET /settings/billing`
8. `GET /settings/audit-events`

Gateway 需要将 `/settings/**` 路由到 auth-service，并纳入 auth-api Sentinel group。

## 允许修改文件

1. backend/auth-service/src/main/java/com/aetherflow/auth/settings/**
2. backend/auth-service/src/test/java/com/aetherflow/auth/settings/**
3. backend/auth-service/src/main/resources/db/settings-admin.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-SETTINGS-ADMIN-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/common/**
3. backend/auth-service/src/main/java/com/aetherflow/auth/controller/UserController.java
4. backend/auth-service/src/main/java/com/aetherflow/auth/service/**
5. backend/auth-service/src/main/java/com/aetherflow/auth/entity/User.java
6. backend/auth-service/src/main/java/com/aetherflow/auth/mapper/UserMapper.java
7. backend/workflow-service/**
8. backend/file-service/**
9. backend/ai-service/**
10. backend/notify-service/**
11. backend/task-service/**
12. backend/*/pom.xml / pom.xml
13. Redis / MQ / Nacos 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/auth-service/src/main/java/com/aetherflow/auth/settings/**
2. backend/auth-service/src/test/java/com/aetherflow/auth/settings/**
3. backend/auth-service/src/main/resources/db/settings-admin.sql
4. docs/agent/tasks/BE-SETTINGS-ADMIN-20260529.md

是否允许修改接口：是，仅允许新增 `/settings/**` REST API。

是否允许新增 DTO：是，仅允许 auth-service 内部 `SettingsDtos`。

是否允许修改数据库：是，仅允许新增 `af_settings_profile`、`af_settings_member`、`af_settings_billing`、`af_settings_audit_event` 表定义，并同步 `docker/mysql/init/01-aetherflow.sql`。

是否允许修改 Redis：否。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：是，仅允许新增 `/settings/** -> auth-service` route 和 auth-api Sentinel pattern。

## Agent 编码计划

1. 先补 controller/service/schema/gateway route contract 测试，锁定 Red。
2. 新增 Settings DTO、entity、mapper、service 和 controller。
3. `GET/PUT /settings/profile` 返回并更新 frontend-shaped workspace settings。
4. `GET/POST/PATCH/DELETE /settings/members/{id}` 管理成员列表，支持 role/status 更新和软删除。
5. `GET /settings/billing` 返回 billing snapshot。
6. `GET /settings/audit-events` 返回最近审计事件；profile/member 写操作记录 audit event。
7. 新增 SQL 和 docker init SQL。
8. Gateway 增加 `/settings/**` route，并更新 route contract 测试。
9. 运行目标测试与相关模块测试。
10. 收工更新任务、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改前端代码。
2. 不修改 auth 现有登录/注册/token 生命周期。
3. 不修改 common DTO、错误码、JWT 或网关鉴权过滤器。
4. 不新增 Redis Key、MQ Event、Nacos 配置。
5. 不把 Settings API 和 Copilot API 混在一个任务里。

## 是否涉及契约变更

是。

1. 新增 Settings REST API：`/settings/**`。
2. 新增 auth-service 内部 DTO：`SettingsDtos`。
3. 新增 DB 表：`af_settings_profile`、`af_settings_member`、`af_settings_billing`、`af_settings_audit_event`。
4. 新增 Gateway 路由：`/settings/** -> auth-service`。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/auth-service/src/main/java/com/aetherflow/auth/settings/**
2. backend/auth-service/src/test/java/com/aetherflow/auth/settings/**
3. backend/auth-service/src/main/resources/db/settings-admin.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-SETTINGS-ADMIN-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service -am -Dtest=SettingsControllerTest,SettingsServiceImplTest,SettingsSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
5. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/gateway-service -am test

## 当前风险

1. 本任务只补 Settings/admin 最小后端闭环，不接真实支付渠道或发票系统。
2. 成员 API 使用 Settings 自有 member 表，不改变 `af_user` 登录账户表。
3. 新增 DB 表需要统一运行电脑执行 SQL 后再联调。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 19:25 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，需补测 Gateway 路由、auth-service 启动、真实 MySQL 表初始化和 Settings 页面 API 链路

## Claim 记录

1. 2026-05-29 19:25，从 main 创建 feature/BE-SETTINGS-ADMIN-20260529-settings-admin。
2. 2026-05-29 19:25，已检查 AGENT.md 文件锁表，目标 settings、Gateway route、docker init 文件未发现 ACTIVE 冲突。
3. 2026-05-29 19:25，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 19:34 +08:00

完成内容：

1. 新增 auth-service `/settings/**` REST API：profile get/update、member list/create/update/delete、billing snapshot、audit events。
2. 新增 Settings DTO、entity、mapper、service 和 controller。
3. 新增 `af_settings_profile`、`af_settings_member`、`af_settings_billing`、`af_settings_audit_event` SQL，并同步 docker MySQL init SQL。
4. profile/member 写操作记录 settings audit event；member delete 采用软删除状态 `removed`。
5. Gateway `auth-service` route 增加 `/settings/**`，Sentinel auth-api pattern 同步增加 `/settings`。
6. 补齐 controller/service/schema/gateway route contract 测试。

验证结果：

1. TDD Red：目标 auth 测试在实现前编译失败，缺少 `com.aetherflow.auth.settings.*`；Gateway route 测试在实现前失败，`/settings/**` 未路由到 auth-service。
2. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
3. `mvn -pl backend/auth-service -am -Dtest=SettingsControllerTest,SettingsServiceImplTest,SettingsSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过，Settings 10 tests。
4. `mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过，GatewayRouteConfigurationTest 5 tests。
5. `mvn -pl backend/auth-service,backend/gateway-service -am test`：通过，common 8 tests；gateway-service 17 tests；auth-service 40 tests。

提交：

1. `ff3a67e docs(agent): claim BE-SETTINGS-ADMIN-20260529`
2. `053f61c feat(auth): add settings admin APIs`

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑应用 settings SQL，并补测 auth-service 启动、Gateway `/settings/**` 路由、真实 MySQL 持久化链路。
2. 本任务不接真实支付渠道或发票系统，Billing snapshot 为 Settings 自有表最小闭环。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：cadb533 merge: backend settings admin。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
