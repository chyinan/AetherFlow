# WORKFLOW-EMBEDDING-NODE-20260529

任务ID：WORKFLOW-EMBEDDING-NODE-20260529
任务名称：Workflow Embedding Node System
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260529-1001-CODEX-WORKFLOW-EMBEDDING
分支：feature/WORKFLOW-EMBEDDING-NODE-20260529-embedding-node
状态：IN_PROGRESS

任务目标：
1. 在不修改 workflow-runtime-api 和 Runtime Core 的前提下，新增企业级 Embedding Workflow Node。
2. 实现 EmbeddingProvider 抽象层，支持未来 Ollama、OpenAI、HuggingFace 扩展。
3. 实现 Spring AI + Ollama 的 OllamaEmbeddingProvider，默认支持本地 `http://localhost:11434` 和 `nomic-embed-text`。
4. 实现 EmbeddingNodeExecutor，从 WorkflowContext 读取文本，切分 chunk，调用 provider，生成向量结果，写入 NodeResult.variables()。
5. 实现 chunkSize / overlap 文本切分器、EmbeddingResult、EmbeddingNodeConfig、Mock Vector Store。
6. 新增 `/workflow/embedding/metrics`，返回 embedding 次数、平均耗时、vector 数量和当前模型。
7. 更新 Workflow Node Catalog 和 Swagger 文档示例，支持 Upload -> Split -> Embedding -> Vector Store 的 RAG 预处理链路。

允许修改文件：
1. backend/workflow-service/**
2. backend/workflow-service/pom.xml
3. backend/workflow-service/src/main/resources/application.yml
4. docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md
5. docs/agent/logs/2026-05-29.md
6. AGENT.md

禁止修改文件：
1. backend/workflow-runtime-api/**
2. RuntimeState、WorkflowContext、NodeExecutor、NodeResult 协议结构
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**
4. DAG Runtime Engine、Workflow 生命周期、Runtime Retry 实现
5. backend/ai-service/**
6. backend/file-service/**
7. backend/common/**
8. backend/gateway-service/**
9. 数据库脚本、MQ 契约、Redis Key、Gateway 路由

是否允许新增文件：是
允许新增的位置：
1. backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/**
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutor.java
3. backend/workflow-service/src/test/java/com/aetherflow/workflow/embedding/**
4. backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutorTest.java

是否允许修改接口：是，仅限：
1. workflow-service 新增 GET /workflow/embedding/metrics。
2. workflow-service GET /workflow/node/catalog 增加 EMBEDDING 节点元数据。

是否允许修改数据库：否
是否允许修改配置：是，仅限 workflow-service application.yml 中 Spring AI Ollama 和 aetherflow.workflow.embedding 配置。

Runtime 边界：
1. Runtime Core 继续负责 DAG、状态机、Retry、生命周期、事件、快照、锁。
2. Embedding 节点只返回 NodeResult 或抛异常，不修改 RuntimeState，不控制 DAG，不实现 Retry。
3. Embedding timeout 或 provider 失败抛出 BusinessException，由 Runtime 现有 RetryPolicy 接管。
4. 不修改 workflow-runtime-api、Runtime Engine、Workflow 生命周期和 Runtime 日志基础设施。

Node 边界：
1. EmbeddingNodeExecutor 只读取 WorkflowContext.variables()、node config、workflowId、traceId、taskId、currentNodeId。
2. 文本输入支持 config.text 或 config.textVariable，默认读取 `ocrText`，并兼容 `text` / `transcription` / `summary` 变量兜底。
3. 节点 config 支持 provider、model、chunkSize、overlap、textVariable、vectorCollection。
4. 节点输出包括 chunks、embeddings、vectorStore，以及 variables 中的 embeddingResults、embeddingVectors、embeddingVectorCount、embeddingModel、embeddingProvider。
5. 所有日志必须通过现有 MDC pattern 携带 traceId、workflowId、nodeId。

Agent 编码计划：
1. TDD 写 EmbeddingNodeConfigTest，锁定 provider/model/chunkSize/overlap 默认值和校验。
2. TDD 写 SimpleTextSplitterTest，锁定 chunkSize、overlap、空文本、非法 overlap 行为。
3. TDD 写 EmbeddingProviderRegistryTest，保证 executor 不写死 provider。
4. TDD 写 MockVectorStore 和 EmbeddingMetrics 测试。
5. TDD 写 EmbeddingNodeExecutorTest，覆盖文本读取、切分、provider 调用、向量结果写入、timeout 抛异常。
6. 实现 EmbeddingProvider、OllamaEmbeddingProvider、EmbeddingRequest、EmbeddingResult、EmbeddingNodeConfig、TextSplitter、MockVectorStore、EmbeddingMetrics。
7. 新增 EmbeddingMetricsController 和 Swagger example。
8. 更新 WorkflowNodeTypes、WorkflowNodeCatalogService、application.yml、workflow-service/pom.xml。
9. 运行目标测试、相关模块测试和 git diff --check。

不会修改：
1. workflow-runtime-api。
2. RuntimeState、WorkflowContext、NodeExecutor、NodeResult。
3. Runtime Core、DAG Engine、Retry、Recovery、Lock、Event Stream。
4. ai-service、file-service、common、gateway-service。
5. 数据库、MQ、Redis、Gateway 路由。

是否涉及契约变更：是
契约范围：
1. workflow-service 新增 GET /workflow/embedding/metrics。
2. workflow-service GET /workflow/node/catalog 增加 EMBEDDING 节点元数据。
3. workflow-service application.yml 新增 `spring.ai.ollama.*` 和 `aetherflow.workflow.embedding.*`。
4. workflow-service pom.xml 新增 Spring AI Ollama 依赖。

文件锁范围：
1. backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/**
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutor.java
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/node/WorkflowNodeTypes.java
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/node/catalog/WorkflowNodeCatalogService.java
5. backend/workflow-service/src/test/java/com/aetherflow/workflow/embedding/**
6. backend/workflow-service/src/test/java/com/aetherflow/workflow/node/executor/EmbeddingNodeExecutorTest.java
7. backend/workflow-service/src/test/java/com/aetherflow/workflow/node/controller/WorkflowNodeCatalogControllerTest.java
8. backend/workflow-service/src/test/java/com/aetherflow/workflow/openapi/WorkflowOpenApiContractTest.java
9. backend/workflow-service/pom.xml
10. backend/workflow-service/src/main/resources/application.yml
11. docs/agent/tasks/WORKFLOW-EMBEDDING-NODE-20260529.md
12. docs/agent/logs/2026-05-29.md
13. AGENT.md

验证方式：
1. git diff --check
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-service -am -Dtest=EmbeddingNodeConfigTest,SimpleTextSplitterTest,EmbeddingProviderRegistryTest,EmbeddingNodeExecutorTest,EmbeddingMetricsControllerTest,WorkflowNodeCatalogControllerTest,WorkflowOpenApiContractTest -Dsurefire.failIfNoSpecifiedTests=false test
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/workflow-service -am test
4. git diff --name-only main...HEAD

环境检测：
1. git：git version 2.53.0.windows.3
2. java：OpenJDK 17.0.19 Microsoft
3. maven：Apache Maven 3.9.9；测试时显式设置 JAVA_HOME 到 JDK 17
4. node：v24.15.0
5. npm：11.12.1
6. 操作系统：Microsoft Windows NT 10.0.26200.0
7. 检测时间：2026-05-29 10:01 +08:00
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，涉及 workflow-service 启动、真实 Ollama、Nacos、MySQL、Redis 链路。

当前风险：
1. 项目当前 Spring Boot 为 3.2.12，Spring AI 版本需要选择与现有依赖兼容的版本并以测试验证。
2. 本地单元测试不依赖真实 Ollama，真实 `nomic-embed-text` / `bge-m3` 模型需要统一运行电脑或开发机手动 pull 后补测。
3. Mock Vector Store 仅用于演示知识库加工，不替代 Milvus / PgVector。
4. embedding 向量可能很大，当前只进入 WorkflowContext.variables，后续真实向量库接入时应避免长期在 Runtime snapshot 中存储大向量。

执行记录：
1. 2026-05-29 10:01，已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md。
2. 2026-05-29 10:01，已确认当前任务边界和验证方式，用户回复“按你的意思来吧，我没意见”。
3. 2026-05-29 10:01，已从 origin/main 创建隔离 worktree 分支 feature/WORKFLOW-EMBEDDING-NODE-20260529-embedding-node。
4. 2026-05-29 10:01，当前进行 docs-only claim；claim push 成功前不修改业务代码。
