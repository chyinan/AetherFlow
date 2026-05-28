任务ID：AUTH-SERVICE-INIT
任务名称：auth-service 用户认证微服务初始化与基础功能开发
负责人：项目仓库所有者
Agent ID：codex-auth-20260528-001
Session ID：SESSION-20260528-AUTH-SERVICE-INIT-CODEX
分支：feature/AUTH-SERVICE-INIT-auth-service-basic
状态：IN_PROGRESS

任务目标：
初始化并完善 auth-service，接入 Nacos、MySQL、MyBatis Plus、Redis、Swagger/OpenAPI，提供用户注册、用户登录、JWT 签发、用户信息查询、基础 RBAC 角色返回与 /health 健康检查能力。

允许修改文件：
1. backend/auth-service/**
2. docs/agent/tasks/AUTH-SERVICE-INIT.md
3. docs/agent/logs/2026-05-28.md

禁止修改文件：
1. gateway-service/**
2. workflow-service/**
3. task-service/**
4. ai-service/**
5. common/**
6. docker/**
7. Nacos 全局配置
8. DTO、MQ、Gateway、Seata、Sentinel

是否允许新增文件：是
允许新增的位置：
1. backend/auth-service/src/main/java/com/aetherflow/auth/**
2. backend/auth-service/src/main/resources/**
3. backend/auth-service/src/test/java/com/aetherflow/auth/**

是否允许修改接口：是
是否允许修改数据库：否
是否允许修改配置：是，仅限 backend/auth-service/src/main/resources/application.yml 与 backend/auth-service/pom.xml

Agent 编码计划：
1. 先补充 auth-service 的测试骨架，覆盖注册、登录、JWT 签发、当前用户查询与健康检查路由。
2. 再补齐服务实现、实体、Mapper、Controller 与 MyBatis Plus 配置，保持 Result 与 common DTO 复用。
3. 接入 Redis 配置和 Swagger/OpenAPI，保持 Nacos/MySQL/现有 JWT 约定不变。
4. 使用 JDK 17 构建验证，并运行 auth-service 相关测试与打包命令。

不会修改：
1. gateway-service、workflow-service、task-service、ai-service、common、docker。
2. 公共 DTO、MQ 契约、Gateway 路由、Seata、Sentinel、数据库初始化 SQL。
3. JWT payload 结构和公共 Result 结构。

是否涉及契约变更：否
文件锁范围：
1. docs/agent/tasks/AUTH-SERVICE-INIT.md
2. docs/agent/logs/2026-05-28.md
验证方式：
1. git diff --name-only main...HEAD
2. mvn -pl backend/auth-service -am test
3. mvn -pl backend/auth-service -am package -DskipTests
4. curl /health、/auth/register、/auth/login、/auth/me、/swagger-ui/index.html

当前风险：
1. 本机默认 java 指向 JDK 21，需要在本次任务中显式切换到 JDK 17 执行 Maven。
2. Redis 与 Nacos 运行态仍依赖统一环境 192.168.101.68。

