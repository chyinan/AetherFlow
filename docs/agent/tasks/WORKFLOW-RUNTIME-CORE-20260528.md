任务ID：WORKFLOW-RUNTIME-CORE-20260528
任务名称：Workflow Runtime Platform Core
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1705-CODEX-WORKFLOW-RUNTIME-CORE
分支：feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core
状态：IN_PROGRESS

任务目标：
建设 AetherFlow Workflow Runtime Platform Core，拆出独立 workflow-runtime-api 协议模块，并在 workflow-service 内实现 Runtime Core、DAG 调度、状态机、Retry、RuntimeEvent、Metrics 与 Observability。Runtime 必须与业务节点解耦，不能包含 Whisper、Summary、Export、Notify 等节点业务逻辑。

允许修改文件：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/**
3. pom.xml
4. docs/superpowers/specs/**
5. docs/superpowers/plans/**
6. docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md
7. docs/agent/logs/2026-05-28.md
8. AGENT.md

禁止修改文件：
1. backend/ai-service/**
2. backend/gateway-service/**
3. backend/auth-service/**
4. backend/file-service/**
5. backend/task-service/**
6. backend/common/**
7. docker/**
8. docker-compose.yml
9. frontend/**
10. python-ai-service/**
11. performance-test/**
12. 公共 DTO、既有 MQ 契约、数据库表结构

是否允许新增文件：是
允许新增的位置：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/**
3. backend/workflow-service/src/test/java/com/aetherflow/workflow/runtime/**
4. docs/superpowers/specs/**
5. docs/superpowers/plans/**
6. docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md

是否允许修改接口：是，仅限新增 workflow-runtime-api 协议类型，以及 workflow-service Runtime 观测接口 /workflow/runtime/metrics、/workflow/runtime/observability/{workflowId}、/workflow/runtime/events/{workflowId}。
是否允许修改数据库：否
是否允许修改配置：是，仅限根 pom.xml、backend/workflow-service/pom.xml、backend/workflow-service/src/main/resources/application.yml。

Agent 编码计划：
1. 完成 docs-only claim，并在 push 成功后才修改业务代码。
2. 写入 Runtime 设计文档和实施计划，锁定 Runtime/Node/Context 边界。
3. 按 TDD 先覆盖 workflow-runtime-api 的 WorkflowContext、RetryPolicy、RuntimeStateMachine、NodeRegistry 协议行为。
4. 新增 workflow-runtime-api Maven 模块，提供 NodeExecutor、WorkflowContext、RuntimeEvent、NodeType、NodeResult、RuntimeState、RetryPolicy 与 NodeRegistry。
5. 在 workflow-service 实现 Runtime State Machine、WorkflowRuntimeEngine、DAG 解析与遍历、Retry 调度、RuntimeEvent 发布、Metrics 与 Observability。
6. 接入 WorkflowService.startInstance，使 Runtime 生命周期由 Runtime Core 推进，同时保留与业务节点解耦。
7. 补齐日志 MDC，保证 Runtime 日志包含 traceId、workflowId、nodeId、taskId。
8. 运行 git diff --name-only main...HEAD、git diff --check、mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test。

不会修改：
1. 不修改 ai-service、gateway-service、auth-service、file-service、task-service、common、docker、frontend、python-ai-service、performance-test。
2. 不修改公共 DTO、既有 MQ 契约、数据库表结构、Gateway 路由。
3. 不实现 Whisper、Summary、Export、Notify 业务节点逻辑。
4. 不在业务层手写巨型 if/else/switch 节点调度。
5. 不让 NodeExecutor 修改 RuntimeState。

是否涉及契约变更：是。新增 workflow-runtime-api 协议模块与 workflow-service Runtime 观测 REST API；不修改公共 DTO、既有 MQ 契约、数据库结构或 Gateway 路由。

文件锁范围：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/**
3. pom.xml
4. docs/superpowers/specs/**
5. docs/superpowers/plans/**
6. docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md
7. docs/agent/logs/2026-05-28.md
8. AGENT.md

验证方式：
1. git diff --name-only main...HEAD
2. git diff --check
3. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test
4. 统一运行电脑补测 workflow-service 启动与 /workflow/runtime/metrics、/workflow/runtime/observability/{workflowId}、/workflow/runtime/events/{workflowId}。

当前风险：
1. 当前任务会新增高风险 Maven 模块和修改 workflow-service application.yml，已在任务边界中登记。
2. 现有 WorkflowDefinitionDTO 没有显式 edges 字段，DAG 解析需要兼容 nodes 顺序与 node.config 中的 next/branches 配置，不能修改公共 DTO。
3. RuntimeEvent 的 MQ 发布只能做可插拔发布能力，不改既有 MQ 名称、队列或 payload 契约。
4. 真实节点执行器尚未由节点开发者实现，Runtime 测试将使用测试执行器验证调度协议。

开工同步记录：
1. 已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md。
2. 已读取 workflow-service、task-service、root pom.xml 和现有 WorkflowDefinitionDTO/WorkflowNodeDTO。
3. 已检查 AGENT.md 文件锁表，未发现 workflow-service、workflow-runtime-api 或根 pom.xml 的 ACTIVE 冲突。
4. GitHub HTTPS 443 首次不可用；已按用户授权改用 SSH remote。
5. 已通过 SSH 执行 git pull origin main，将 main 快进到 1af89ce。
6. 已从最新 main 创建分支 feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core。

环境检测：
1. git：git version 2.53.0.windows.3
2. java：openjdk version "17.0.19" 2026-04-21 LTS，Microsoft build 17.0.19+10-LTS
3. maven：Apache Maven 3.9.9，Java version 17.0.19
4. node：v24.15.0
5. npm：11.12.1
6. 操作系统：Windows 11 amd64
7. 检测时间：2026-05-28 17:05:15 +08:00
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，原因是 workflow-service 真实 MySQL/Nacos/Seata/RabbitMQ 链路需要统一运行环境验证。

