任务ID：BE-KNOWLEDGE-DATASET-20260529
任务名称：Knowledge Dataset / Document API Backend Gap
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1905-BE-KNOWLEDGE-DATASET
分支：feature/BE-KNOWLEDGE-DATASET-20260529-knowledge-dataset
状态：IN_PROGRESS

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
