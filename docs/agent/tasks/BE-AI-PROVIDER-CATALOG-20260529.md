任务ID：BE-AI-PROVIDER-CATALOG-20260529
任务名称：AI Provider Frontend Catalog / Logs / Policy Timeout
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1807-BE-AI-PROVIDER-CATALOG
分支：feature/BE-AI-PROVIDER-CATALOG-20260529-provider-catalog
状态：DONE

## 任务目标

基于 FE-API-INTEGRATION-20260529 暴露的 P1 缺口，补齐 ai-service 面向前端模型治理页需要的 Provider Catalog、frontend-shaped Runtime Log Feed，并在现有 ProviderRoutingPolicy 中增加请求超时字段。

本任务只做 ai-service 的最小闭环，不修改前端、不修改 Gateway、不新增数据库表。

## 允许修改文件

1. backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiProviderController.java
2. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicy.java
3. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicyService.java
4. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogService.java
5. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogResponse.java
6. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRuntimeLogResponse.java
7. backend/ai-service/src/test/java/com/aetherflow/ai/controller/AiProviderControllerTest.java
8. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderCatalogServiceTest.java
9. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderRoutingPolicyTest.java
10. backend/ai-service/src/test/java/com/aetherflow/ai/openapi/AiOpenApiContractTest.java
11. docs/agent/tasks/BE-AI-PROVIDER-CATALOG-20260529.md
12. docs/agent/logs/2026-05-29.md
13. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/gateway-service/**
3. backend/common/**
4. backend/workflow-service/**
5. backend/file-service/**
6. backend/notify-service/**
7. backend/auth-service/**
8. backend/ai-service/src/main/resources/application.yml
9. backend/ai-service/pom.xml
10. scripts/db/**
11. docker/**
12. Nacos / MQ / Gateway 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogService.java
2. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogResponse.java
3. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRuntimeLogResponse.java
4. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderCatalogServiceTest.java
5. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderRoutingPolicyTest.java

是否允许修改接口：是，仅允许新增 `GET /ai/provider/catalog`、`GET /ai/provider/logs?limit=`，并向现有 `ProviderRoutingPolicy` 增加向后兼容字段 `requestTimeout`。

是否允许修改 DTO：是，仅允许 ai-service 内部 provider 包响应 DTO 与 `ProviderRoutingPolicy` 字段扩展；不修改 backend/common 公共 DTO。

是否允许修改数据库：否。

是否允许修改 Redis：是，仅允许现有 `ProviderRoutingPolicy` Redis JSON 值增加可选 `requestTimeout` 字段；不新增 Redis Key，不改变已有 Key 名称。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：否。

## Agent 编码计划

1. 先补 controller/service/policy/openapi 单元测试，覆盖 catalog、logs、policy requestTimeout 归一化和契约注解。
2. 新增 ProviderCatalogService，输出后端权威的 provider endpoint label、默认模型、模型能力、context window、pricing metadata 字段。
3. 新增 ProviderRuntimeLogResponse，把现有 AIInferenceLog 映射为前端更易消费的 runtime log feed。
4. 扩展 AiProviderController，保持所有 controller 返回 `Result<T>`。
5. 扩展 ProviderRoutingPolicy 与 defaultPolicy，让 `requestTimeout` 默认来自 `aetherflow.ai.provider-timeout`。
6. 运行目标测试和 ai-service 全量测试。
7. 收工更新任务文档、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改 frontend 代码。
2. 不修改 Gateway 路由。
3. 不修改 backend/common 公共 DTO。
4. 不新增或修改 DB 表。
5. 不新增 Redis Key。
6. 不修改 MQ/Nacos/docker 配置。
7. 不改 Python AI runtime。

## 是否涉及契约变更

是。

1. 新增 REST API：`GET /ai/provider/catalog`。
2. 新增 REST API：`GET /ai/provider/logs?limit=`。
3. 扩展 ProviderRoutingPolicy 响应/请求字段：`requestTimeout`。
4. Redis 值结构兼容性变更：现有 ProviderRoutingPolicy JSON 可新增 `requestTimeout` 字段；旧 JSON 缺失该字段时由 normalized/defaultPolicy 回填。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/ai-service/src/main/java/com/aetherflow/ai/controller/AiProviderController.java
2. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicy.java
3. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRoutingPolicyService.java
4. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogService.java
5. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderCatalogResponse.java
6. backend/ai-service/src/main/java/com/aetherflow/ai/provider/ProviderRuntimeLogResponse.java
7. backend/ai-service/src/test/java/com/aetherflow/ai/controller/AiProviderControllerTest.java
8. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderCatalogServiceTest.java
9. backend/ai-service/src/test/java/com/aetherflow/ai/provider/ProviderRoutingPolicyTest.java
10. backend/ai-service/src/test/java/com/aetherflow/ai/openapi/AiOpenApiContractTest.java
11. docs/agent/tasks/BE-AI-PROVIDER-CATALOG-20260529.md
12. docs/agent/logs/2026-05-29.md
13. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am -Dtest=AiProviderControllerTest,ProviderCatalogServiceTest,ProviderRoutingPolicyTest,AiOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am test

## 当前风险

1. Pricing 属于易变数据。本任务提供字段和后端静态默认值，真实动态价格同步需要后续独立任务接入配置或 Provider 元数据源。
2. ProviderRoutingPolicy 写入 Redis JSON 会多一个字段；旧值缺失时必须保持兼容。
3. Gateway `/ai/provider/**` 路由已由既有任务处理；若当前分支单独部署，需要确认 Gateway 分支/主线已包含该路由。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 18:07 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，仍需补测真实 Gateway / ai-service / Python AI runtime / Redis 链路

## Claim 记录

1. 2026-05-29 18:07，从 main 创建 feature/BE-AI-PROVIDER-CATALOG-20260529-provider-catalog。
2. 2026-05-29 18:07，已检查 AGENT.md 文件锁表，目标 ai-service 文件未发现 ACTIVE 冲突。
3. 2026-05-29 18:07，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 18:15 +08:00

完成内容：

1. 新增 `GET /ai/provider/catalog`，返回 provider cards 和 model catalog rows。
2. 新增 `GET /ai/provider/logs?limit=`，返回 frontend-shaped runtime log feed，limit 限制为 1-100。
3. `ProviderRoutingPolicy` 新增 `requestTimeout` 字段，并由 `ProviderRoutingPolicyService` 默认填充 `aetherflow.ai.provider-timeout`。
4. 新增 Provider Catalog / Runtime Log 响应 DTO，保持在 ai-service 内部 provider 包，不修改 backend/common。
5. 补充 controller、service、policy、OpenAPI 合约测试。

验证记录：

1. TDD 红灯：`mvn -pl backend/ai-service -am -Dtest=AiProviderControllerTest,ProviderCatalogServiceTest,ProviderRoutingPolicyTest,AiOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test`
   - 结果：未通过，符合预期。
   - 证据：缺少 ProviderCatalogResponse / ProviderCatalogService / ProviderRuntimeLogResponse。
2. 目标测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am -Dtest=AiProviderControllerTest,ProviderCatalogServiceTest,ProviderRoutingPolicyTest,AiOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test`
   - 结果：通过。
   - 证据：9 tests，BUILD SUCCESS。
3. ai-service 全量测试：`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/ai-service -am test`
   - 结果：通过。
   - 证据：common 8 tests；ai-service 25 tests；BUILD SUCCESS。
4. 静态检查：`git diff --check`
   - 结果：通过。
   - 证据：无 whitespace error，仅 Windows LF/CRLF 提示。
5. 修改范围检查：`git diff --name-only main...HEAD`
   - 结果：通过。
   - 证据：修改限定在任务允许的 ai-service 文件、测试文件、AGENT.md、任务文档和当日日志。

提交：

1. d04fba0 docs(agent): claim BE-AI-PROVIDER-CATALOG-20260529
2. f9ab5d7 feat(ai): add provider catalog APIs

状态：DONE

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：

1. Gateway `/ai/provider/**` 路由依赖既有 Gateway 路由任务或后续 main 合并结果。
2. 真实 Provider health、Redis policy JSON 兼容、Python AI runtime 模型支持仍需统一运行电脑联调。
3. OpenAI 价格未写死为实时价格；如需正式计费展示，应后续接入配置化价格源。

文件锁：RELEASED
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：760f6ee merge: backend ai provider catalog。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
