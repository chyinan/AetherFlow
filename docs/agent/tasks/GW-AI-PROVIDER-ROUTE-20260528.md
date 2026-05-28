任务ID：GW-AI-PROVIDER-ROUTE-20260528
任务名称：AI Provider Orchestration 管理 API Gateway 路由接入
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1219-codex-gw-ai-provider-route
分支：feature/GW-AI-PROVIDER-ROUTE-20260528-gateway-route
状态：IN_PROGRESS

任务目标：
为 ai-service 新增的 AI Provider Orchestration 管理 API 接入 gateway-service 路由，使前端可通过 Gateway 访问 /ai/provider/status、/ai/provider/policy、/ai/provider/metrics 和 /ai/provider/policy/recover/{provider}，不修改 ai-service Provider Orchestration 业务逻辑、接口路径、请求参数或响应字段。

允许修改文件：
1. backend/gateway-service/**
2. backend/gateway-service/src/test/**
3. backend/gateway-service/src/main/resources/application.yml
4. docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md
5. docs/agent/logs/2026-05-28.md
6. AGENT.md

禁止修改文件：
1. backend/ai-service/**
2. backend/workflow-service/**
3. backend/task-service/**
4. backend/auth-service/**
5. backend/common/**
6. docker/**
7. docker-compose.yml
8. 根 pom.xml
9. MQ 契约、公共 DTO、数据库结构

是否允许新增文件：是
允许新增的位置：
1. backend/gateway-service/**
2. backend/gateway-service/src/test/**
3. docs/agent/tasks/**
4. docs/agent/logs/**

是否允许修改接口：否，仅新增 Gateway 路由，不改变 ai-service API 路径、请求参数或响应字段。
是否允许修改数据库：否
是否允许修改配置：是，仅允许 backend/gateway-service/src/main/resources/application.yml。

Agent 编码计划：
1. 完成 docs-only claim，并在 push 成功后才修改 gateway-service 代码和配置。
2. 沿用 gateway-service 现有 application.yml 静态路由风格，在 /ai/** 泛路由前新增显式 /ai/provider/** 到 lb://ai-service 的路由。
3. 保持 /ai/provider/** 不进入 permit-all 白名单，使其继续走 Gateway JWT 鉴权、Token 黑名单、Trace 和访问日志。
4. 不新增 /internal/** 路由；不暴露 ai-service 或其他服务内部接口。
5. 检查 Sentinel 配置，按现有 ai-service route-id/IP 限流风格为显式 provider 路由补治理配置，避免新增 route 绕过 route-id 维度限流。
6. 补充 gateway-service 路由测试，至少验证 /ai/provider/status、/ai/provider/policy、/ai/provider/metrics 能匹配到 ai-service。
7. 运行指定验证：git diff --name-only main...HEAD 与 mvn -pl backend/gateway-service -am test。
8. 收工更新任务文档、日志、AGENT.md 文件锁和交接记录，状态置为 REVIEW。

不会修改：
1. 不修改 backend/ai-service/** 及其 Provider Orchestration 业务代码。
2. 不修改 workflow-service、task-service、auth-service、common、docker。
3. 不修改公共 DTO、MQ 契约、数据库结构、根 pom.xml 或 docker-compose.yml。
4. 不改变 ai-service 已有 API 的路径、请求参数或响应字段。
5. 不新增或暴露任何 /internal/** Gateway 路由。

是否涉及契约变更：是，仅涉及 Gateway 路由接入契约 /ai/provider/** -> ai-service；该变更由当前任务边界明确授权。不涉及服务 API、DTO、DB、MQ、Redis Key 或错误码变更。

文件锁范围：
1. backend/gateway-service/**
2. docs/agent/tasks/GW-AI-PROVIDER-ROUTE-20260528.md
3. docs/agent/logs/2026-05-28.md
4. AGENT.md

验证方式：
1. git diff --name-only main...HEAD
2. 使用 JDK 17 运行 mvn -pl backend/gateway-service -am test

当前风险：
1. 主线已有 /ai/** 泛路由；新增 /ai/provider/** 必须设置更高优先级或更靠前顺序，避免匹配结果不稳定。
2. 新增 route-id 后，若不补 Sentinel route-id/IP 规则，provider 管理 API 可能绕过现有 ai-service route-id 维度限流。
3. 当前默认 java/mvn 指向 Java 11；Maven 验证需显式设置 JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot。
4. GitHub HTTPS 连接本次 fetch 出现超时和 reset；claim push 成功前不会修改 gateway-service 业务文件。

路由冲突与安全风险分析：
1. /ai/provider/** 是 /ai/** 的子路径，显式路由需放在泛路由前并设置更高优先级，确保 status、policy、metrics、recover 请求优先落到 provider 管理路由。
2. 不将 /ai/provider/** 加入 aetherflow.gateway.security.permit-all，管理 API 默认需要 JWT，且会移除伪造的 X-User-* 头后再透传真实用户信息。
3. Sentinel apiGroups 现有 /ai 前缀会覆盖 /ai/provider/**；新增 provider route-id 后需补 route-id/IP 限流，保持治理覆盖。
4. 不新增 /internal/**、/internal/ai/** 或服务发现动态内部路由，符合 docs/COMMON_CONTRACTS.md 对内部接口不得经 Gateway 暴露的要求。

开工同步记录：
1. 已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md。
2. 已检查 gateway-service 现有 application.yml 路由、JWT 白名单、Sentinel 配置和 GatewayRouteConfigurationTest。
3. 当前原工作区在 feature/AI-PROVIDER-ORCH-20260528-provider-orchestration 且存在 frontend 未提交改动；为避免触碰无关改动，已从 local main 创建独立 worktree D:\Programs\AetherFlow-gw-provider-route。
4. git fetch origin main 连续失败，原因是 GitHub HTTPS 连接超时/reset；本地 main 与 origin/main 均为 62aa707，已从 local main 创建本任务分支。
5. 当前进行 docs-only claim，claim push 成功前不修改 backend/gateway-service 业务代码。

环境检测：
1. git：git version 2.53.0.windows.3
2. java：openjdk version "11.0.31" 2026-04-21 LTS
3. maven：Apache Maven 3.9.9，默认 Java version 11.0.31，platform encoding GBK
4. node：v24.15.0
5. npm：11.12.1
6. 操作系统：Microsoft Windows 11 专业工作站版 64 位
7. 检测时间：2026-05-28 12:19:24 +08:00
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，原因是本机默认 Java 不是项目要求的 Java 17；本任务 Maven 验证将显式切到本机 JDK 17。
