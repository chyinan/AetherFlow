# API-SWAGGER-CONTRACT-20260528

任务ID：API-SWAGGER-CONTRACT-20260528
任务名称：API Contract / Swagger Documentation
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-2257-codex-api-swagger-contract
分支：feature/API-SWAGGER-CONTRACT-20260528-swagger-contract
状态：REVIEW

## 任务目标

补齐 backend Swagger / OpenAPI 文档，使前端可以通过 Gateway 聚合 Swagger UI 清晰对接 workflow-service、ai-service、notify-service，并新增只读 Workflow Node Catalog API。

## 允许修改文件

1. backend/workflow-service/**
2. backend/ai-service/**
3. backend/notify-service/**
4. backend/common/src/main/java/com/aetherflow/common/dto/**
5. docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md
6. docs/agent/logs/2026-05-28.md
7. AGENT.md

## 条件允许修改文件

1. backend/gateway-service/src/main/resources/application.yml：仅在 Swagger 聚合访问 `http://localhost:8080/swagger-ui.html` 出现配置问题时，停止编码并追加文件锁后修改。

## 禁止修改文件

1. backend/workflow-runtime-api/**
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/core/**
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/**
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/**
5. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/**
6. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/**
7. MQ 契约、RabbitMQ queue / exchange / routing key
8. 数据库结构、SQL、Mapper XML、迁移脚本
9. frontend/**、file-service/**、task-service/**、auth-service/**、python-ai-service/**

## 权限说明

是否允许新增文件：是，仅允许在 backend/workflow-service 内新增 Workflow Node Catalog 只读 API / DTO / 测试文件，必要时在 ai-service、notify-service 测试目录新增 OpenAPI/controller 测试。

是否允许修改接口：是，仅允许新增 `GET /workflow/node/catalog` 只读 API，并补充 Swagger/OpenAPI 注解；不得改变既有 API 路径、参数、响应结构或业务语义。

是否允许修改数据库：否。

是否允许修改配置：否。Gateway Swagger 聚合如有问题需先追加 claim 后再改配置。

## Agent 编码计划

1. 先补 Workflow Node Catalog controller 测试，验证 `/workflow/node/catalog` 返回 START、END、UPLOAD、WHISPER、SUMMARY、EXPORT、NOTIFY、CONDITION、MOCK，以及每类节点的 config schema、输入变量、输出变量、示例配置。
2. 实现 catalog 只读服务和 DTO，接入现有 `/workflow/node` controller，不触碰 Runtime Core。
3. 给 workflow-service 的 `WorkflowController`、`WorkflowRuntimeController`、`WorkflowNodeMetricsController` 补 `@Tag`、`@Operation`、`@ApiResponse`、参数说明和响应说明。
4. 给 ai-service 的 `AiController`、`AiProviderController`、`AiWorkflowNodeController` 补 OpenAPI 注解，其中 `/ai/internal/**` 明确标注 Internal service-to-service。
5. 给 notify-service 的 `NotifyController` 补 SSE 公开 API 与 `/notify/internal/send` Internal API 文档。
6. 给 workflow / ai / notify 相关 common DTO 补 `@Schema`、字段说明和 example，必要时给 ai-service provider 响应模型补 Schema。
7. 运行 `git diff --check` 和指定 Maven 测试，记录结果并更新 handoff。

## 不会修改

1. 不修改 workflow-runtime-api。
2. 不修改 Runtime Core、DAG、Engine、Recovery、Lock。
3. 不修改 MQ 契约。
4. 不修改数据库结构。
5. 不修改 Gateway，除非 Swagger 聚合验证失败并重新登记文件锁。
6. 不修改业务行为、鉴权逻辑、Provider 路由策略、Notify 发送逻辑。

## 是否涉及契约变更

是，仅涉及：

1. OpenAPI / Swagger 文档契约补全。
2. 新增只读前端对接 API：`GET /workflow/node/catalog`。

不涉及 DB、MQ、Redis Key、错误码变更。

## 文件锁范围

1. backend/workflow-service/**
2. backend/ai-service/**
3. backend/notify-service/**
4. backend/common/src/main/java/com/aetherflow/common/dto/**
5. docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md
6. docs/agent/logs/2026-05-28.md
7. AGENT.md

## 验证方式

1. `git diff --check`
2. `$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test`
3. 统一运行电脑补测：启动 Gateway 与相关服务后访问 `http://localhost:8080/swagger-ui.html`，确认 workflow-service、ai-service、notify-service OpenAPI 可聚合加载。

## 环境检测

1. git：git version 2.53.0.windows.3。
2. java：OpenJDK 17.0.19 Microsoft。
3. maven：Apache Maven 3.9.9；默认 Java 11.0.31，测试时显式设置 JAVA_HOME 为 JDK 17。
4. node：v24.15.0。
5. npm：11.12.1。
6. 操作系统：Microsoft Windows 11 专业工作站版。
7. 检测时间：2026-05-28 22:57 +08:00。
8. 不能执行的命令：无。
9. 是否需要统一运行电脑补测：是，需补测 Gateway Swagger UI 聚合与多服务真实启动。

## 当前风险

1. `mvn -version` 默认 Java 为 11，所有 Maven 验证必须显式设置 JDK 17。
2. Gateway 当前已配置 Swagger 聚合 URL，但本机不一定启动 Nacos 与多服务；Swagger UI 真实聚合需统一运行电脑补测。
3. `/workflow/node/**` 现有 Gateway 业务路由未在本任务中修改；本任务只保证 Swagger 聚合与服务内 API 文档，若需前端经 Gateway 调用新 catalog API，应单独登记 Gateway 路由任务或追加 claim。

## 执行记录

1. 2026-05-28 22:57，已读取 AGENT.md 与 docs/COMMON_CONTRACTS.md。
2. 2026-05-28 22:57，已同步 main，`git pull origin main` 返回 Already up to date。
3. 2026-05-28 22:57，已创建分支 `feature/API-SWAGGER-CONTRACT-20260528-swagger-contract`。
4. 2026-05-28 22:57，已检查文件锁，目标范围内未发现 ACTIVE 冲突。
5. 2026-05-28 22:57，当前进行 docs-only claim；claim push 成功前不修改业务代码。
6. 2026-05-28 22:58，docs-only claim 已提交并推送：`554b5d5 docs(agent): claim API-SWAGGER-CONTRACT-20260528`。
7. 2026-05-28 23:02，新增 Workflow Node Catalog 测试，RED 失败原因：缺少 `WorkflowNodeCatalogController`、`WorkflowNodeCatalogService` 和 catalog DTO。
8. 2026-05-28 23:04，补齐 catalog 只读 API 后，`WorkflowNodeCatalogControllerTest` GREEN 通过。
9. 2026-05-28 23:06，新增 OpenAPI 反射测试，RED 失败原因：common DTO 缺少 `@Schema`，workflow/ai/notify Controller 缺少 `@Tag`/`@Operation`/`@ApiResponse`。
10. 2026-05-28 23:11，补齐 OpenAPI 注解与 DTO Schema 后，OpenAPI 目标测试 GREEN 通过。
11. 2026-05-28 23:15，最终执行 `git diff --check` 通过，仅 Windows LF/CRLF 提示。
12. 2026-05-28 23:15，最终执行 `$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test` 通过。
13. 2026-05-28 23:16，业务提交已完成并推送：`7c86da6 feat(api): add swagger contracts and workflow node catalog`。

## 完成内容

1. workflow-service 补齐 `WorkflowController`、`WorkflowRuntimeController`、`WorkflowNodeMetricsController` 的 OpenAPI 注解。
2. 新增 `GET /workflow/node/catalog`，返回 START、END、UPLOAD、WHISPER、SUMMARY、EXPORT、NOTIFY、CONDITION、MOCK 的节点类型、config schema、输入变量、输出变量和示例配置。
3. ai-service 补齐 `AiController`、`AiProviderController`、`AiWorkflowNodeController` 的 OpenAPI 注解，并明确 `/ai/internal/workflow/nodes/execute` 为 Internal service-to-service API。
4. notify-service 补齐 SSE 公开 API 与 `/notify/internal/send` Internal API 文档。
5. common DTO 补齐 workflow、AI workflow node、AI transcription、file metadata、notify message 的 `@Schema` 字段说明与 example。
6. ai-service Provider governance 响应模型补齐 `@Schema`，便于前端对接 provider status/policy/metrics。
7. 新增 OpenAPI/controller 相关测试：`WorkflowNodeCatalogControllerTest`、`WorkflowOpenApiContractTest`、`CommonDtoOpenApiSchemaTest`、`AiOpenApiContractTest`、`NotifyOpenApiContractTest`。

## 验证结果

1. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
2. `$env:JAVA_HOME='C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'; $env:Path="$env:JAVA_HOME\bin;$env:Path"; mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test`：通过，common 8 tests、workflow-runtime-api 10 tests、workflow-service 70 tests、ai-service 20 tests、notify-service 1 test、BUILD SUCCESS。
3. 修改范围检查：未修改 `backend/workflow-runtime-api/**`、Runtime Core 禁区、MQ 契约、数据库结构、Gateway 配置。

## 交接

任务ID：API-SWAGGER-CONTRACT-20260528
完成内容：已补齐 Swagger/OpenAPI 注解、DTO Schema、Internal API 标识，并新增 Workflow Node Catalog 只读 API。
修改文件：backend/workflow-service/**；backend/ai-service/**；backend/notify-service/**；backend/common/src/main/java/com/aetherflow/common/dto/**；docs/agent/tasks/API-SWAGGER-CONTRACT-20260528.md；docs/agent/logs/2026-05-28.md；AGENT.md
测试结果：`git diff --check` 通过；`mvn -pl backend/common,backend/workflow-service,backend/ai-service,backend/notify-service -am test` 通过。
PR/提交/分支：feature/API-SWAGGER-CONTRACT-20260528-swagger-contract；`554b5d5` claim；`7c86da6` 业务提交。
合入 main：未合入。
统一运行电脑验证：未运行。
遗留问题：需统一运行电脑补测 Gateway Swagger 聚合入口 `http://localhost:8080/swagger-ui.html`；如前端必须经 Gateway 直接调用 `/workflow/node/catalog`，需单独登记 Gateway 路由或追加 claim。
下一步：负责人 Review 后合入 main，并在统一运行电脑启动 Gateway、workflow-service、ai-service、notify-service 补测 Swagger 聚合。
文件锁：RELEASED。
