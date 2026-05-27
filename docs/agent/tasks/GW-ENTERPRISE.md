任务ID：GW-ENTERPRISE
任务名称：gateway-service 企业级微服务网关能力开发
负责人：项目库所有者
Agent ID：chyinan
Session ID：SESSION-20260527-GW-ENTERPRISE-CODEX
分支：feature/GW-ENTERPRISE-gateway-governance
状态：REVIEW

任务目标：
在 gateway-service 内实现企业级网关能力，包括 JWT 统一鉴权、TraceId、请求日志、耗时统计、Sentinel 网关限流和降级、Redis Token 黑名单、统一异常响应、动态路由、Swagger 聚合和健康状态接口。

允许修改文件：
1. backend/gateway-service/**
2. docs/agent/tasks/GW-ENTERPRISE.md

禁止修改文件：
1. workflow-service/**
2. task-service/**
3. auth-service/**
4. ai-service/**
5. file-service/**
6. notify-service/**
7. backend/common/**
8. 数据库、MQ、DTO、公共 Result、Seata 配置

是否允许新增文件：是
允许新增的位置：
1. backend/gateway-service/src/main/java/com/aetherflow/gateway/**
2. backend/gateway-service/src/test/java/com/aetherflow/gateway/**

是否允许修改接口：仅允许 gateway-service 新增 /gateway/status 健康状态接口
是否允许修改数据库：否
是否允许修改配置：是，仅限 backend/gateway-service/src/main/resources/application.yml 和 backend/gateway-service/pom.xml

Agent 编码计划：
1. 为 gateway-service 增加配置属性、Redis Token 黑名单服务、统一 JSON 响应写出工具。
2. 增强 JWT 全局鉴权 Filter，支持白名单、非法 Token 拦截、用户信息透传、黑名单和过期校验。
3. 新增 TraceId 和访问日志 Filter，统计请求耗时并透传响应头。
4. 新增 Sentinel 网关配置，支持接口级限流、IP 限流、异常降级和统一 Result 返回。
5. 新增 Gateway 全局异常处理，输出统一 Result、HTTP 状态码和异常日志。
6. 新增 /gateway/status 接口，补充 Swagger 聚合和动态路由配置。
7. 编写 gateway-service 单元测试并运行 Maven 验证。

不会修改：
1. 业务服务目录
2. 公共 DTO 和 Result
3. 数据库和 MQ
4. Seata 配置

是否涉及契约变更：是，新增 gateway-service 内部健康状态接口 /gateway/status，新增网关路由和治理配置。
文件锁范围：
1. backend/gateway-service/**
2. docs/agent/tasks/GW-ENTERPRISE.md

验证方式：
1. JAVA_HOME 指向 C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot
2. mvn -pl backend/gateway-service -am test
3. mvn -pl backend/gateway-service -am package -DskipTests

当前风险：
1. Sentinel、Nacos、Redis 运行态依赖外部基础设施，本地 Maven 测试只能验证代码和配置加载基础能力。
2. Gateway 动态路由和限流策略需要统一运行环境联调确认。

验证记录：
1. 2026-05-27 18:59，JAVA_HOME 指向 C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot，基线执行 mvn -pl backend/gateway-service -am test，通过。
2. 2026-05-27 19:31，执行 mvn -pl backend/gateway-service -am test，通过，Tests run: 13, Failures: 0, Errors: 0, Skipped: 0。
3. 2026-05-27 19:23，执行 mvn -pl backend/gateway-service -am package -DskipTests，通过，gateway-service jar 生成成功。

交接记录：
1. 已完成 gateway-service 企业级网关能力开发。
2. 修改范围限制在 backend/gateway-service/** 和本任务文档。
3. 未修改 workflow-service、task-service、auth-service、ai-service、file-service、notify-service、backend/common、数据库、MQ、DTO、公共 Result、Seata 配置。
4. 需要统一运行电脑联调 Nacos、Redis、Sentinel Dashboard 和各微服务 OpenAPI 路由。
5. Review 阶段修复 Swagger 聚合路由，为每个服务增加 /{service-prefix}/v3/api-docs 到 /v3/api-docs 的 RewritePath 路由。
