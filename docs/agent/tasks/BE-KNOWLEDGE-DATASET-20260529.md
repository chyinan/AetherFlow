任务ID：BE-KNOWLEDGE-DATASET-20260529
任务名称：Knowledge Dataset / Document API Backend Gap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1905-BE-KNOWLEDGE-DATASET
分支：feature/BE-KNOWLEDGE-DATASET-20260529-knowledge-dataset
状态：DONE

## 任务目标

补齐 FE-API-INTEGRATION-20260529 暴露的 Knowledge dataset/document 后端缺口，提供 Knowledge 页面可接入的最小持久化闭环：

1. `GET /knowledge/datasets`
2. `POST /knowledge/datasets`
3. `GET /knowledge/datasets/{id}`
4. `GET /knowledge/datasets/{id}/documents`
5. `POST /knowledge/datasets/{id}/documents`
6. `GET /knowledge/documents/{id}/chunks`
7. `POST /knowledge/datasets/{id}/retrieval-test`

本任务将 Knowledge API 放在 workflow-service 内实现，复用既有 `SimpleTextSplitter` 生成文档 chunks；不接外部 Dify，不新增向量库，不修改前端。

## 允许修改文件

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/controller/KnowledgeController.java
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/dto/KnowledgeDtos.java
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/entity/KnowledgeDatasetEntity.java
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/entity/KnowledgeDocumentEntity.java
5. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/entity/KnowledgeChunkEntity.java
6. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/mapper/KnowledgeDatasetMapper.java
7. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/mapper/KnowledgeDocumentMapper.java
8. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/mapper/KnowledgeChunkMapper.java
9. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/KnowledgeService.java
10. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java
11. backend/workflow-service/src/main/resources/db/knowledge-dataset.sql
12. docker/mysql/init/01-aetherflow.sql
13. backend/workflow-service/src/test/java/com/aetherflow/workflow/knowledge/controller/KnowledgeControllerTest.java
14. backend/workflow-service/src/test/java/com/aetherflow/workflow/knowledge/service/KnowledgeServiceImplTest.java
15. backend/workflow-service/src/test/java/com/aetherflow/workflow/knowledge/db/KnowledgeSchemaTest.java
16. backend/gateway-service/src/main/resources/application.yml
17. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
18. docs/agent/tasks/BE-KNOWLEDGE-DATASET-20260529.md
19. docs/agent/logs/2026-05-29.md
20. AGENT.md

## 禁止修改文件

1. frontend/**
2. backend/common/**
3. backend/auth-service/**
4. backend/file-service/**
5. backend/ai-service/**
6. backend/notify-service/**
7. backend/task-service/**
8. backend/workflow-runtime-api/**
9. backend/workflow-service/src/main/java/com/aetherflow/workflow/project/**
10. backend/workflow-service/src/main/java/com/aetherflow/workflow/controller/WorkflowController.java
11. backend/workflow-service/src/main/java/com/aetherflow/workflow/service/**
12. backend/workflow-service/src/main/resources/application.yml
13. pom.xml / backend/*/pom.xml
14. Redis / MQ / Nacos 配置

## 新增与契约权限

是否允许新增文件：是。

允许新增位置：

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/knowledge/**
3. backend/workflow-service/src/main/resources/db/knowledge-dataset.sql
4. docs/agent/tasks/BE-KNOWLEDGE-DATASET-20260529.md

是否允许修改接口：是，仅允许新增 `/knowledge/**` REST API。

是否允许新增 DTO：是，仅允许 workflow-service 内部 `KnowledgeDtos`。

是否允许修改数据库：是，仅允许新增 `af_knowledge_dataset`、`af_knowledge_document`、`af_knowledge_chunk` 表定义，并同步 `docker/mysql/init/01-aetherflow.sql`。

是否允许修改 Redis：否。

是否允许修改 MQ：否。

是否允许修改 Gateway 配置：是，仅允许新增 `/knowledge/** -> workflow-service` route 和 workflow-api Sentinel pattern。

## Agent 编码计划

1. 先补 controller/service/schema/gateway 目标测试，锁定 Red。
2. 新增 Knowledge entity、mapper、DTO、service 和 controller。
3. dataset list 返回 `PageResult<KnowledgeDatasetSummary>`，支持 `query`、`status`、`page`、`size`。
4. document create 复用 `SimpleTextSplitter` 生成 chunks，并更新 dataset document/chunk/processing counters。
5. `GET /knowledge/documents/{id}/chunks` 返回前端 `KnowledgeSegment` 可映射字段。
6. `POST /knowledge/datasets/{id}/retrieval-test` 做基于 source/preview 的本地 top-k 检索预览。
7. 新增 SQL 和 docker init SQL。
8. Gateway 增加 `/knowledge/**` route，并更新 route contract 测试。
9. 运行目标测试与相关模块测试。
10. 收工更新任务、日志、AGENT.md，释放文件锁。

## 不会修改

1. 不修改前端代码。
2. 不修改 Project/Workspace 分支或文件。
3. 不新增向量数据库、Redis Key、MQ Event、Nacos 配置。
4. 不接外部 Dify/Notion/Web crawler；外部知识源只通过 metadata/sourceType 字段表达。
5. 不修改现有 Workflow Runtime、Node Catalog、Embedding Node 行为。

## 是否涉及契约变更

是。

1. 新增 Knowledge REST API：`/knowledge/**`。
2. 新增 workflow-service 内部 DTO：`KnowledgeDtos`。
3. 新增 DB 表：`af_knowledge_dataset`、`af_knowledge_document`、`af_knowledge_chunk`。
4. 新增 Gateway 路由：`/knowledge/** -> workflow-service`。

契约登记状态：APPROVED，见 AGENT.md 第 12 节。

## 文件锁范围

1. backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/knowledge/**
3. backend/workflow-service/src/main/resources/db/knowledge-dataset.sql
4. docker/mysql/init/01-aetherflow.sql
5. backend/gateway-service/src/main/resources/application.yml
6. backend/gateway-service/src/test/java/com/aetherflow/gateway/GatewayRouteConfigurationTest.java
7. docs/agent/tasks/BE-KNOWLEDGE-DATASET-20260529.md
8. docs/agent/logs/2026-05-29.md
9. AGENT.md

## 验证方式

1. git diff --check
2. git diff --name-only main...HEAD
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=KnowledgeControllerTest,KnowledgeServiceImplTest,KnowledgeSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test
4. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test
5. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service,backend/gateway-service -am test

## 当前风险

1. 本任务只提供本地 SQL 持久化和字符切块，不实现生产向量检索；后续如需语义召回需接正式向量库。
2. `POST /knowledge/datasets/{id}/documents` 接收文本内容或 fileId/sourceName metadata，不直接从 file-service 拉取文件二进制。
3. 新增 DB 表需要统一运行电脑应用 `docker/mysql/init/01-aetherflow.sql` 或 `backend/workflow-service/src/main/resources/db/knowledge-dataset.sql` 后再联调。

## 环境检测

- git：git version 2.53.0.windows.3
- java：OpenJDK 17.0.19 Microsoft
- maven：Apache Maven 3.9.9
- node：v24.15.0
- npm：11.12.1
- 操作系统：Windows 11 amd64
- 检测时间：2026-05-29 19:05 +08:00
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，需补测 Gateway 路由、workflow-service 启动、真实 MySQL 表初始化和 Knowledge 页面 API 链路

## Claim 记录

1. 2026-05-29 19:05，从 main 创建 feature/BE-KNOWLEDGE-DATASET-20260529-knowledge-dataset。
2. 2026-05-29 19:05，已检查 AGENT.md 文件锁表，目标 knowledge、Gateway route、docker init 文件未发现 ACTIVE 冲突。
3. 2026-05-29 19:05，登记任务边界、文件锁和契约变更。

## 完成记录

时间：2026-05-29 19:22 +08:00

完成内容：

1. 新增 workflow-service `/knowledge/**` REST API：dataset list/create/detail、document list/create、document chunks、retrieval-test。
2. 新增 `KnowledgeDtos`、Knowledge dataset/document/chunk entity、mapper、service 与 controller。
3. 文档创建复用 `SimpleTextSplitter` 生成 chunks，并更新 dataset document/chunk counters。
4. 新增 `af_knowledge_dataset`、`af_knowledge_document`、`af_knowledge_chunk` SQL，并同步 docker MySQL init SQL。
5. Gateway `workflow-service` route 增加 `/knowledge/**`，Sentinel workflow-api pattern 同步增加 `/knowledge`。
6. 补齐 controller/service/schema/gateway route contract 测试。

验证结果：

1. TDD Red：目标 workflow 测试在实现前编译失败，缺少 `com.aetherflow.workflow.knowledge.*`；Gateway route 测试在实现前失败，`/knowledge/**` 未路由到 workflow-service。
2. `git diff --check`：通过，无 whitespace error，仅 Windows LF/CRLF 提示。
3. `mvn -pl backend/workflow-service -am -Dtest=KnowledgeControllerTest,KnowledgeServiceImplTest,KnowledgeSchemaTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过，Knowledge 9 tests。
4. `mvn -pl backend/gateway-service -am -Dtest=GatewayRouteConfigurationTest -Dsurefire.failIfNoSpecifiedTests=false test`：通过，GatewayRouteConfigurationTest 5 tests。
5. `mvn -pl backend/workflow-service,backend/gateway-service -am test`：通过，common 8 tests；workflow-runtime-api 10 tests；gateway-service 17 tests；workflow-service 103 tests。

提交：

1. `326e4dc docs(agent): claim BE-KNOWLEDGE-DATASET-20260529`
2. `2a9091f feat(workflow): add knowledge dataset APIs`

合入 main：已合入。

统一运行电脑验证：未运行。

遗留问题：

1. 需在统一运行电脑应用 knowledge SQL，并补测 workflow-service 启动、Gateway `/knowledge/**` 路由、真实 MySQL 持久化链路。
2. 本任务只提供本地 SQL 和文本检索预览，不替代正式向量库 / 语义召回。

文件锁：RELEASED。
## Main Merge

时间：2026-05-29 20:09 +08:00

记录：

1. 已按负责人指令将该任务 feature 分支合入 main。
2. 主线合入提交：b8929e7 merge: backend knowledge dataset。
3. 主线静态检查通过：git diff --check。
4. 主线后端相关模块测试通过：JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/auth-service,backend/workflow-service,backend/file-service,backend/ai-service,backend/notify-service,backend/gateway-service -am test。
5. 测试证据：common 9 tests；workflow-runtime-api 10 tests；gateway-service 24 tests；auth-service 40 tests；workflow-service 135 tests；ai-service 32 tests；file-service 35 tests；notify-service 6 tests；BUILD SUCCESS。

合入 main：已合入。

统一运行电脑验证：未运行。

文件锁：RELEASED。
