任务ID：AUTH-SERVICE-ENTERPRISE
任务名称：auth-service 企业级认证服务治理增强
负责人：项目仓库所有者
Agent ID：codex-auth-20260528-002
Session ID：SESSION-20260528-AUTH-SERVICE-ENTERPRISE-CODEX
分支：feature/AUTH-SERVICE-ENTERPRISE-auth-governance
状态：IN_PROGRESS

任务目标：
在 auth-service 内实现企业级认证服务治理能力，包括 Access Token + Refresh Token、Redis Session 管理、Token 黑名单、登录审计日志、TraceId/requestId/userId 日志规范、DTO 参数校验、auth-service 本地统一异常处理、Swagger 完善、Redis Key 规范、Metrics API 和登录安全限制。

允许修改文件：
1. backend/auth-service/**
2. docs/agent/tasks/AUTH-SERVICE-ENTERPRISE.md
3. docs/agent/logs/2026-05-28.md

禁止修改文件：
1. gateway-service/**
2. workflow-service/**
3. task-service/**
4. ai-service/**
5. common/**
6. docker/**
7. 公共 DTO、MQ、Gateway、数据库结构、Nacos 全局配置

是否允许新增文件：是
允许新增的位置：
1. backend/auth-service/src/main/java/com/aetherflow/auth/**
2. backend/auth-service/src/test/java/com/aetherflow/auth/**

是否允许修改接口：是，仅限 auth-service 新增 /auth/refresh、/auth/logout、/auth/status、/auth/metrics 并增强 /auth/register、/auth/login 响应。
是否允许修改数据库：否
是否允许修改配置：是，仅限 backend/auth-service/src/main/resources/application.yml

Agent 编码计划：
1. 先补充 auth-service 单元测试，覆盖 refresh token、Redis session、黑名单、登录失败限制、metrics、日志上下文和异常响应。
2. 新增 auth-service 私有 DTO，避免修改 backend/common 公共 DTO 结构。
3. 新增 Redis key 常量与 Session/Token 治理服务，统一使用 auth:token:{userId}、auth:refresh:{userId}、auth:blacklist:{token} 等 key。
4. 增强 UserService 与 UserController，注册/登录签发 access + refresh token，refresh 自动续期，logout 写黑名单并清理 session。
5. 新增登录审计服务和安全限制服务，记录 userId、IP、登录时间、状态、User-Agent，并用 Redis 控制失败次数和限流。
6. 新增 auth-service 本地 Trace 日志 Filter 与全局异常处理，日志 pattern 固化 traceId、userId、requestId。
7. 完善 Swagger 注解与 application.yml 治理参数。
8. 使用 JDK 17 执行 Maven test/package，记录无法在本机验证的外部 Redis/MySQL/Nacos 联调项。

不会修改：
1. gateway-service、workflow-service、task-service、ai-service、common、docker。
2. 公共 DTO、MQ 契约、Gateway 路由、数据库表结构、Nacos 全局配置。
3. Seata、Sentinel、RabbitMQ、Docker 部署文件。

是否涉及契约变更：是。仅限 auth-service 接口新增和返回体增强、auth-service Redis Key 约定新增；已由用户在 2026-05-28 当前会话确认。
文件锁范围：
1. backend/auth-service/**
2. docs/agent/tasks/AUTH-SERVICE-ENTERPRISE.md
3. docs/agent/logs/2026-05-28.md

验证方式：
1. git diff --name-only main...HEAD
2. mvn -pl backend/auth-service -am test
3. mvn -pl backend/auth-service -am package -DskipTests
4. 统一运行环境 192.168.101.68 补测 /auth/login、/auth/refresh、/auth/logout、/auth/status、/auth/metrics、/swagger-ui/index.html

当前风险：
1. 当前本机默认 java 为 JDK 21；JDK 17 位于 C:\Users\25611\.codex\jdks\microsoft-jdk-17.0.19\jdk-17.0.19+10，后续 Maven 验证需显式设置 JAVA_HOME。
2. git fetch origin 在 2026-05-28 本次会话中因 github.com HTTPS 连接重置失败；当前企业增强分支从 feature/AUTH-SERVICE-INIT-auth-service-basic 的 b671465 切出。
3. Gateway 当前已有独立黑名单前缀 aetherflow:gateway:token:blacklist:；本任务不修改 Gateway，因此 auth:blacklist:{token} 是否被 Gateway 拦截需要后续网关任务或配置对齐。
4. Redis/MySQL/Nacos 运行态依赖 192.168.101.68 统一环境，本机单元测试只能覆盖代码行为和配置解析。

阻塞记录：
1. docs-only claim 已本地提交：77aecc7 docs(agent): claim AUTH-SERVICE-ENTERPRISE。
2. git push -u origin feature/AUTH-SERVICE-ENTERPRISE-auth-governance 失败：无法连接 github.com:443。
3. Test-NetConnection github.com -Port 443 失败，TcpTestSucceeded=False。
4. github.com:22 可连通，但 ssh -T git@github.com 返回 Permission denied (publickey)，当前机器没有可用 GitHub SSH key。
5. 按 AGENT.md claim-first 规则，claim push 成功前不得修改 backend/auth-service 业务代码。

恢复记录：
1. 用户已完成 GitHub SSH 登录配置。
2. 已将 origin 切换为 git@github.com:chyinan/AetherFlow.git。
3. 已成功推送 feature/AUTH-SERVICE-ENTERPRISE-auth-governance，claim-first 前置条件已满足。
4. 任务状态恢复为 IN_PROGRESS。
