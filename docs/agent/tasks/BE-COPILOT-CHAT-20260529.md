任务ID：BE-COPILOT-CHAT-20260529
任务名称：Copilot Chat API Backend Gap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1936-BE-COPILOT-CHAT
分支：feature/BE-COPILOT-CHAT-20260529-copilot-chat
状态：DONE

## 任务目标

补齐 FE-API-INTEGRATION-20260529 暴露的 Copilot chat 后端缺口，在 ai-service 提供前端 Copilot 面板可接入的最小会话闭环：

1. `POST /copilot/chat`
2. `GET /copilot/conversations`
3. `GET /copilot/conversations/{id}/messages`

Gateway 需要将 `/copilot/**` 路由到 ai-service，并纳入 ai-api Sentinel group。

## 允许修改文件

1. backend/ai-service/src/main/java/com/aetherflow/ai/copilot/**
2. backend/ai-service/src/test/java/com/aetherflow/ai/copilot/**
3. backend/ai-service/src/main/resources/db/copilot-chat.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-COPILOT-CHAT-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/common/**
3. backend/ai-service/src/main/java/com/aetherflow/ai/controller/**
4. backend/ai-service/src/main/java/com/aetherflow/ai/provider/**
5. backend/ai-service/src/main/java/com/aetherflow/ai/service/**
6. backend/auth-service/**
7. backend/workflow-service/**
8. backend/file-service/**
9. backend/notify-service/**
10. backend/task-service/**
11. backend/*/pom.xml / pom.xml
12. Redis / MQ / Nacos 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/ai-service/src/main/java/com/aetherflow/ai/copilot/**
2. backend/ai-service/src/test/java/com/aetherflow/ai/copilot/**
3. backend/ai-service/src/main/resources/db/copilot-chat.sql
4. docs/agent/tasks/BE-COPILOT-CHAT-20260529.md

是否允许修改接口：是，仅允许新增 `/copilot/**` REST API。

是否允许新增 DTO：是，仅允许 ai-service 内部 `CopilotDtos`。

是否允许修改数据库：是，仅允许新增 `af_copilot_conversation`、`af_copilot_message` 表定义，并同步 `docker/mysql/init/01-aetherflow.sql`。

是否允许修改 Redis：否。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：是，仅允许新增 `/copilot/** -> ai-service` route 和 ai-api Sentinel pattern。

## Agent 编码计划

1. 先补 controller/service/schema/gateway route contract 测试，锁定 Red。
2. 新增 Copilot DTO、entity、mapper、service 和 controller。
3. `POST /copilot/chat` 接收 prompt、conversationId、workflowId、projectId、context，写入 user message 和 assistant reply。
4. assistant reply 使用 deterministic backend heuristic，暂不调用外部 LLM，避免引入 provider 依赖或流式契约。
5. `GET /copilot/conversations` 返回最近会话摘要。
6. `GET /copilot/conversations/{id}/messages` 返回会话消息。
7. 新增 SQL 和 docker init SQL。
8. Gateway 增加 `/copilot/**` route，并更新 route contract 测试。
9. 运行目标测试与相关模块测试。
10. 收工更新任务、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改前端代码。
2. 不修改现有 AI Provider routing、policy、metrics、logs。
3. 不新增 streaming SSE/WebSocket Copilot 契约。
4. 不新增 Redis Key、MQ Event、Nacos 配置。
5. 不把 Copilot API 和 Settings API 混在一个任务里。

## 是否涉及契约变更

是。

1. 新增 Copilot REST API：`/copilot/**`。
2. 新增 ai-service 内部 DTO：`CopilotDtos`。
3. 新增 DB 表：`af_copilot_conversation`、`af_copilot_message`。
4. 新增 Gateway 路由：`/copilot/** -> ai-service`。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/ai-service/src/main/java/com/aetherflow/ai/copilot/**
2. backend/ai-service/src/test/java/com/aetherflow/ai/copilot/**
3. backend/ai-service/src/main/resources/db/copilot-chat.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-COPILOT-CHAT-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am -Dtest=CopilotControllerTest,CopilotServiceImplTest,CopilotSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
5. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service,backend/gateway-service -am test

## 当前风险

1. 本任务不实现流式 token 输出，不接外部 LLM；回复为 deterministic 后端规则，后续可单独接 AI Provider。
2. 新增 DB 表需要统一运行电脑执行 SQL 后再联调。
3. 前端当前仍是 mock facade，真实接入需前端后续任务切换。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 19:36 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，需补测 Gateway 路由、ai-service 启动、真实 MySQL 表初始化和 Copilot 面板 API 链路

## Claim 记录

1. 2026-05-29 19:36，从 main 创建 feature/BE-COPILOT-CHAT-20260529-copilot-chat。
2. 2026-05-29 19:36，已检查 AGENT.md 文件锁表，目标 copilot、Gateway route、docker init 文件未发现 ACTIVE 冲突。
3. 2026-05-29 19:36，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 19:47 +08:00

完成内容：

1. ai-service 新增 Copilot 会话 API：`POST /copilot/chat`、`GET /copilot/conversations`、`GET /copilot/conversations/{id}/messages`。
2. 新增 Copilot DTO、conversation/message entity、mapper、service 和 controller。
3. 新增 `af_copilot_conversation`、`af_copilot_message` 表 SQL，并同步 docker MySQL init SQL。
4. Gateway 将 `/copilot/**` 路由到 ai-service，并纳入 ai-api Sentinel pattern。
5. 回复生成采用 deterministic backend heuristic，未引入外部 LLM、Redis、MQ 或流式契约。

验证记录：

1. git diff --check
   - 结果：通过
   - 证据：无 whitespace error，仅 Windows LF/CRLF 提示
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am -Dtest=CopilotControllerTest,CopilotServiceImplTest,CopilotSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test
   - 结果：通过
   - 证据：Copilot 目标测试 7 tests；BUILD SUCCESS
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
   - 结果：通过
   - 证据：GatewayRouteConfigurationTest 5 tests；BUILD SUCCESS
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service,backend/gateway-service -am test
   - 结果：通过
   - 证据：common 8 tests；gateway-service 17 tests；ai-service 27 tests；BUILD SUCCESS

提交：

1. b531eb6 docs(agent): claim BE-COPILOT-CHAT-20260529
2. 55d7a6f feat(ai): add copilot chat APIs

状态：DONE

合入 main：已合入。

统一运行电脑验证：未运行

遗留问题：

1. 需统一运行电脑应用 Copilot SQL 后补测 ai-service 启动和 Gateway `/copilot/**` 路由。
2. 前端 Copilot 面板需后续前端任务切换到真实 `/copilot/**` API。
3. 本任务未实现流式 Copilot、外部 LLM Provider 接入或权限细化。

文件锁：RELEASED
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：39937cc merge: backend copilot chat。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
