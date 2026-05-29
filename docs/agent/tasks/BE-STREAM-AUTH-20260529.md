任务ID：BE-STREAM-AUTH-20260529
任务名称：Secure Browser Stream Auth for Notify WebSocket
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1820-BE-STREAM-AUTH
分支：feature/BE-STREAM-AUTH-20260529-stream-auth
状态：DONE

## 任务目标

基于 FE-API-INTEGRATION-20260529 暴露的 P1 Stream Auth 缺口，为浏览器 WebSocket 场景补齐安全认证能力。

本任务采用短期 stream token 方案：

1. 前端未来通过已鉴权 REST 接口获取短期 token。
2. Browser WebSocket 通过 query token 建连。
3. Gateway 对 `/notify/ws` 放行 JWT 校验，由 notify-service 校验 stream token。
4. notify-service 不再信任 `userId` query 参数作为 WS 身份。

## 允许修改文件

1. backend/notify-service/src/main/java/com/aetherflow/notify/controller/NotifyController.java
2. backend/notify-service/src/main/java/com/aetherflow/notify/config/WebSocketConfig.java
3. backend/notify-service/src/main/java/com/aetherflow/notify/config/NotifySecurityConfig.java
4. backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationWebSocketHandler.java
5. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenService.java
6. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptor.java
7. backend/notify-service/src/main/java/com/aetherflow/notify/dto/StreamTokenResponse.java
8. backend/notify-service/src/test/java/com/aetherflow/notify/controller/NotifyControllerTest.java
9. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenServiceTest.java
10. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptorTest.java
11. backend/notify-service/src/test/java/com/aetherflow/notify/openapi/NotifyOpenApiContractTest.java
12. backend/gateway-service/src/main/resources/application.yml
13. backend/gateway-service/src/main/java/com/aetherflow/gateway/config/GatewaySecurityProperties.java
14. backend/gateway-service/src/test/java/com/aetherflow/gateway/filter/JwtAuthenticationFilterTest.java
15. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
16. docs/agent/tasks/BE-STREAM-AUTH-20260529.md
17. docs/agent/logs/2026-05-29.md
18. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/common/**
3. backend/workflow-service/**
4. backend/file-service/**
5. backend/ai-service/**
6. backend/auth-service/**
7. backend/notify-service/src/main/resources/application.yml
8. backend/notify-service/pom.xml
9. backend/gateway-service/pom.xml
10. scripts/db/**
11. docker/**
12. Nacos / MQ / DB 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/notify-service/src/main/java/com/aetherflow/notify/config/NotifySecurityConfig.java
2. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenService.java
3. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptor.java
4. backend/notify-service/src/main/java/com/aetherflow/notify/dto/StreamTokenResponse.java
5. backend/notify-service/src/test/java/com/aetherflow/notify/controller/NotifyControllerTest.java
6. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenServiceTest.java
7. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptorTest.java

是否允许修改接口：是，仅允许新增 `POST /notify/stream-token`，并要求 `/notify/ws` 使用 `streamToken` 或 `token` query 参数校验。

是否允许修改 DTO：是，仅允许 notify-service 内部 `StreamTokenResponse`。

是否允许修改数据库：否。

是否允许修改 Redis：否。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：是，仅允许 Gateway 放行 `/notify/ws` 的 JWT 过滤，由 notify-service stream token 承担 WS 身份认证；不修改其他路由。

## Agent 编码计划

1. 先写 notify-service token service、controller、handshake interceptor 和 Gateway permit-all 测试。
2. 新增 `StreamTokenService`，复用 common `JwtProperties/JwtTokenProvider`，签发 1 分钟短期 token，角色包含 `STREAM_NOTIFY`。
3. 新增 `POST /notify/stream-token`，从 Gateway 透传的 `X-User-Id` / `X-Username` 签发 token。
4. WebSocket handshake 从 `streamToken` 或 `token` query 读取 token，校验后写入 session attributes。
5. `NotificationWebSocketHandler` 使用 handshake attribute 中的 userId，不再信任 userId query。
6. Gateway permit-all 增加 `/notify/ws`，并补测试证明 WS 可以无 Bearer 到达 notify-service；其他 `/notify/**` 仍需 JWT。
7. 运行 notify-service、gateway-service 目标测试和相关模块全量测试。
8. 收工更新任务、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改前端代码，不打开 WS fallback。
2. 不修改 backend/common。
3. 不修改 auth-service JWT 契约。
4. 不新增 DB / Redis / MQ。
5. 不修改 notify-service application.yml。
6. 不改变 Notify SSE 现有 fetch Authorization 模式。

## 是否涉及契约变更

是。

1. 新增 REST API：`POST /notify/stream-token`。
2. 新增 DTO：`StreamTokenResponse`。
3. Gateway 安全配置：`/notify/ws` 由 Gateway JWT 改为 notify-service stream token 校验。
4. WebSocket 契约：`/notify/ws?streamToken=...` 或 `/notify/ws?token=...`，token 有效期 1 分钟。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/notify-service/src/main/java/com/aetherflow/notify/controller/NotifyController.java
2. backend/notify-service/src/main/java/com/aetherflow/notify/config/WebSocketConfig.java
3. backend/notify-service/src/main/java/com/aetherflow/notify/config/NotifySecurityConfig.java
4. backend/notify-service/src/main/java/com/aetherflow/notify/service/NotificationWebSocketHandler.java
5. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenService.java
6. backend/notify-service/src/main/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptor.java
7. backend/notify-service/src/main/java/com/aetherflow/notify/dto/StreamTokenResponse.java
8. backend/notify-service/src/test/java/com/aetherflow/notify/controller/NotifyControllerTest.java
9. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenServiceTest.java
10. backend/notify-service/src/test/java/com/aetherflow/notify/service/StreamTokenHandshakeInterceptorTest.java
11. backend/notify-service/src/test/java/com/aetherflow/notify/openapi/NotifyOpenApiContractTest.java
12. backend/gateway-service/src/main/resources/application.yml
13. backend/gateway-service/src/main/java/com/aetherflow/gateway/config/GatewaySecurityProperties.java
14. backend/gateway-service/src/test/java/com/aetherflow/gateway/filter/JwtAuthenticationFilterTest.java
15. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
16. docs/agent/tasks/BE-STREAM-AUTH-20260529.md
17. docs/agent/logs/2026-05-29.md
18. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/notify-service,backend/gateway-service -am -Dtest=NotifyControllerTest,StreamTokenServiceTest,StreamTokenHandshakeInterceptorTest,NotifyOpenApiContractTest,JwtAuthenticationFilterTest,GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/notify-service,backend/gateway-service -am test

## 当前风险

1. Gateway `/notify/ws` 放行后必须确保 notify-service handshake 强制 token 校验，否则会形成匿名 WS 入口。
2. Query token 可能出现在访问日志中，因此 token 必须短期有效；本任务设置 1 分钟有效期。
3. 前端未在本任务修改，Notify WS fallback 仍需前端后续显式接入和联调。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 18:20 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，需补测真实 Gateway WS 代理、notify-service WS handshake、JWT/stream token 链路

## Claim 记录

1. 2026-05-29 18:20，从 main 创建 feature/BE-STREAM-AUTH-20260529-stream-auth。
2. 2026-05-29 18:20，已检查 AGENT.md 文件锁表，目标 notify-service/gateway-service 文件未发现 ACTIVE 冲突。
3. 2026-05-29 18:20，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 18:31 +08:00

完成内容：

1. 新增 `POST /notify/stream-token`，从 Gateway 透传的 `X-User-Id` / `X-Username` 签发 1 分钟 stream token。
2. 新增 `StreamTokenService`，复用 common JWT secret/issuer 派生 stream issuer，token role 为 `STREAM_NOTIFY`。
3. 新增 `StreamTokenHandshakeInterceptor`，`/notify/ws` 只接受 `streamToken` 或 `token` query token。
4. `NotificationWebSocketHandler` 不再信任 `userId` query，改用 handshake attribute 中已校验的 `userId`。
5. Gateway `permit-all` 增加 `/notify/ws`，让 Browser WebSocket 可以无 Authorization header 建连；其他 `/notify/**` 仍需 Bearer。
6. 补充 notify-service controller/service/handshake/OpenAPI 测试和 gateway route/JWT filter 测试。

验证记录：

1. TDD 红灯：`mvn -pl backend/notify-service,backend/gateway-service -am -Dtest=NotifyControllerTest,StreamTokenServiceTest,StreamTokenHandshakeInterceptorTest,NotifyOpenApiContractTest,JwtAuthenticationFilterTest,GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test`
   - 结果：未通过，符合预期。
   - 证据：Gateway `/notify/ws` 未放行，Notify token/interceptor 类缺失。
2. 目标测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/notify-service,backend/gateway-service -am -Dtest=NotifyControllerTest,StreamTokenServiceTest,StreamTokenHandshakeInterceptorTest,NotifyOpenApiContractTest,JwtAuthenticationFilterTest,GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test`
   - 结果：通过。
   - 证据：gateway-service 12 tests；notify-service 6 tests；BUILD SUCCESS。
3. 相关模块全量测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/notify-service,backend/gateway-service -am test`
   - 结果：通过。
   - 证据：common 8 tests；gateway-service 19 tests；notify-service 6 tests；BUILD SUCCESS。
4. 静态检查：`git diff --check`
   - 结果：通过。
   - 证据：无 whitespace error，仅 Windows LF/CRLF 提示。
5. 修改范围检查：`git diff --name-only main...HEAD`
   - 结果：通过。
   - 证据：修改限定在任务允许的 notify-service、gateway-service、AGENT.md、任务文档和当日日志。

提交：

1. 8001e03 docs(agent): claim BE-STREAM-AUTH-20260529
2. 8275135 feat(notify): add stream token websocket auth

状态：DONE

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：

1. 需统一运行电脑补测真实 Gateway WebSocket upgrade、notify-service handshake、JWT 签发和 stream token 建连链路。
2. 前端未在本任务修改，Notify WS fallback 仍保持由前端后续显式接入后再开启。

文件锁：RELEASED
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：2a9638e merge: backend stream auth。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
