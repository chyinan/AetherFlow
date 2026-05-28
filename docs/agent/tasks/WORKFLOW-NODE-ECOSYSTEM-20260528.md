任务ID：WORKFLOW-NODE-ECOSYSTEM-20260528
任务名称：Workflow Node Ecosystem 与 AI Node Executor System
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-2144-CODEX-WORKFLOW-NODE-ECOSYSTEM
分支：feature/WORKFLOW-NODE-ECOSYSTEM-20260528-node-ecosystem
状态：DONE

任务目标：
1. 在不修改 workflow-runtime-api 和 Runtime Core 的前提下，建设 Workflow Node Ecosystem。
2. 在 workflow-service 注册 START、END、UPLOAD、WHISPER、SUMMARY、EXPORT、NOTIFY、CONDITION、MOCK 等 NodeExecutor。
3. 节点统一依赖 workflow-runtime-api 的 NodeExecutor、WorkflowContext、NodeResult、NodeType。
4. Whisper 和 Summary 节点通过 ai-service 的 AI Node Executor System 执行，不在 workflow-service 重造 AI 推理。
5. Upload 和 Export 节点通过 file-service 与 MinIO 完成文件 metadata 读取和导出产物登记。
6. Notify 节点调用 notify-service 完成工作流通知。
7. 新增 /workflow/node/metrics，返回节点执行次数、重试次数、失败次数。

允许修改文件：
1. backend/workflow-service/**
2. backend/workflow-service/pom.xml
3. backend/workflow-service/src/main/resources/application.yml
4. backend/ai-service/**
5. backend/file-service/**
6. backend/common/src/main/java/com/aetherflow/common/dto/**
7. docs/superpowers/**
8. docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md
9. docs/agent/logs/2026-05-28.md
10. AGENT.md

禁止修改文件：
1. backend/workflow-runtime-api/**
2. RuntimeState、WorkflowContext、NodeExecutor、NodeResult 协议结构
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/core/**
4. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/dag/**
5. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/**
6. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/**
7. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/**
8. MQ Exchange、Routing Key、Queue、Payload 契约
9. 数据库表结构和脚本
10. gateway-service、auth-service、task-service、frontend

是否允许新增文件：是
允许新增的位置：
1. backend/workflow-service/src/main/java/com/aetherflow/workflow/node/**
2. backend/workflow-service/src/test/java/com/aetherflow/workflow/node/**
3. backend/workflow-service/src/main/java/com/aetherflow/workflow/client/**
4. backend/ai-service/src/main/java/com/aetherflow/ai/controller/**
5. backend/ai-service/src/test/java/com/aetherflow/ai/**
6. backend/file-service/src/test/java/com/aetherflow/file/**
7. backend/common/src/main/java/com/aetherflow/common/dto/**
8. docs/superpowers/specs/**
9. docs/superpowers/plans/**

是否允许修改接口：是，仅限：
1. workflow-service 新增 /workflow/node/metrics。
2. file-service 新增 GET /internal/files/metadata/{fileId}。
3. ai-service 新增 POST /ai/internal/workflow/nodes/execute。
4. common 新增 AiWorkflowNodeRequestDTO、AiWorkflowNodeResponseDTO。

是否允许修改数据库：否
是否允许修改配置：是，仅限 workflow-service application.yml 中节点、MinIO、file internal token 配置。

Runtime 边界：
1. Runtime Core 继续负责 DAG、状态机、Retry、生命周期、事件、快照、锁。
2. 本任务不修改 Runtime Core，不让节点推进 RuntimeState。
3. Runtime 仍只通过 NodeRegistry 查找 NodeExecutor。
4. Runtime 仍由 NodeResult.variables() 合并变量。

Node 边界：
1. Node 只执行节点逻辑，返回 NodeResult 或抛出异常。
2. Node 可读取 WorkflowContext.variables()、nodeOutputs()、workflowId、traceId、taskId、currentNodeId。
3. Node 不修改 RuntimeState，不控制 DAG，不管理 Retry，不发布 Runtime 生命周期事件。
4. Node 日志必须包含 traceId、workflowId、nodeId。

Agent 编码计划：
1. 使用 Superpowers 写入 Node Ecosystem 设计文档和实施计划。
2. TDD 先写 workflow-service 节点配置解析、BaseNodeExecutor、Metrics、Mock/Start/End/Condition 测试。
3. TDD 补 UploadNodeExecutor，file-service 内部 metadata GET，workflow-service FileClient。
4. TDD 补 ai-service workflow node 内部执行入口，复用现有 ASR/SUMMARY executor。
5. TDD 补 WhisperNodeExecutor 和 SummaryNodeExecutor，返回 NodeResult.variables()。
6. TDD 补 ExportNodeExecutor，写 MinIO 并调用 file-service metadata 注册。
7. TDD 补 NotifyNodeExecutor，调用 notify-service。
8. 更新 application.yml。
9. 运行验证并更新交接。

不会修改：
1. workflow-runtime-api。
2. RuntimeState、WorkflowContext、NodeExecutor、NodeResult。
3. Runtime Core 状态机、DAG、Retry、锁、恢复、事件流。
4. MQ 契约。
5. 数据库结构。

是否涉及契约变更：是
契约范围：
1. workflow-service /workflow/node/metrics。
2. file-service GET /internal/files/metadata/{fileId}。
3. ai-service POST /ai/internal/workflow/nodes/execute。
4. common AiWorkflowNodeRequestDTO / AiWorkflowNodeResponseDTO。
5. workflow-service application.yml 新增节点和 MinIO 配置。

文件锁范围：
1. backend/workflow-service/**
2. backend/ai-service/**
3. backend/file-service/**
4. backend/common/src/main/java/com/aetherflow/common/dto/**
5. docs/superpowers/**
6. docs/agent/tasks/WORKFLOW-NODE-ECOSYSTEM-20260528.md
7. docs/agent/logs/2026-05-28.md
8. AGENT.md

验证方式：
1. git diff --check
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test
3. git diff --name-only main...HEAD

环境检测：
1. git：2.53.0.windows.3
2. java：OpenJDK 17.0.19 Microsoft
3. maven：Apache Maven 3.9.9；默认 Java 11，需要测试时显式设置 JAVA_HOME 到 JDK 17
4. node：v24.15.0
5. npm：11.12.1
6. 操作系统：Windows 11
7. 检测时间：2026-05-28 21:44 +08:00
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，涉及 Nacos、Feign、MinIO、MySQL、Redis 真实链路

当前风险：
1. 当前 workflow-runtime-api 的 NodeType 是 value object，不是 enum；按禁止修改 workflow-runtime-api 原则，本任务使用 NodeType.of(...) 注册节点类型，不改协议。
2. NodeExecutor 无法直接读取 WorkflowNodeDTO.config；本任务采用 workflow-service 启动实例时把节点 config 注入 variables 的方式解决，不改 WorkflowContext 结构。
3. Export 节点真实写 MinIO 依赖统一运行环境配置，本地单元测试使用 mock。
4. AI 内部节点入口需复用 ai-service 现有 ASR/SUMMARY executor，避免重复实现 Provider Router。
5. 统一运行电脑仍需补测 workflow-service、ai-service、file-service 的真实 Nacos / MinIO / Notify 链路。

执行记录：
1. 2026-05-28 21:44，docs-only claim 已提交并推送：bd4624f docs(agent): claim WORKFLOW-NODE-ECOSYSTEM-20260528。
2. 2026-05-28 21:52，已写入设计文档 docs/superpowers/specs/2026-05-28-workflow-node-ecosystem-design.md。
3. 2026-05-28 21:52，已写入实施计划 docs/superpowers/plans/2026-05-28-workflow-node-ecosystem.md。
4. 2026-05-28 22:34，业务代码已提交：`f9f87f7 feat(workflow): add node executor ecosystem`。
5. 2026-05-28 22:34，`JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test` 通过：common 8 tests、workflow-runtime-api 10 tests、workflow-service 67 tests、ai-service 19 tests、file-service 21 tests。
6. 2026-05-28 22:34，`git diff --check` 通过，无 whitespace error，仅 Windows LF/CRLF 提示。
7. 2026-05-28 22:49，已按负责人指令合入 main：`33e265e merge: workflow node ecosystem`。
8. 2026-05-28 22:49，main 上 `git diff --check HEAD^..HEAD` 通过。
9. 2026-05-28 22:49，main 上 `JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/common,backend/file-service,backend/ai-service,backend/workflow-service -am test` 通过：common 8 tests、workflow-runtime-api 10 tests、workflow-service 67 tests、ai-service 19 tests、file-service 21 tests。
