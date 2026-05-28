任务ID：WORKFLOW-RUNTIME-CORE-20260528
任务名称：Workflow Runtime Platform Core
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1705-CODEX-WORKFLOW-RUNTIME-CORE
分支：feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core
状态：DONE

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

实施记录：
1. docs-only claim 已提交并推送：fa92b7c docs(agent): claim WORKFLOW-RUNTIME-CORE-20260528。
2. Runtime 设计与实施计划已写入 docs/superpowers/specs/2026-05-28-workflow-runtime-core-design.md 和 docs/superpowers/plans/2026-05-28-workflow-runtime-core.md。
3. 新增 backend/workflow-runtime-api Maven 模块，并加入根 pom.xml modules。
4. workflow-runtime-api 已提供 NodeExecutor、WorkflowContext、RuntimeEvent、RuntimeEventPublisher、RuntimeEventType、NodeType、NodeResult、RuntimeState、RetryPolicy、NodeRegistry。
5. WorkflowContext 在 workflow-service 内由 DefaultWorkflowContext 实现，variables 使用 ConcurrentHashMap，nodeOutputs 对 Node 调用方只读。
6. RuntimeStateMachine 已限制状态推进，只允许 Runtime 从 PENDING/RUNNING/RETRYING 推进到合法目标状态。
7. WorkflowRuntimeEngine 已支持 DAG 顺序兜底、显式 next/nextNodes、condition branches/defaultNext、NodeRegistry 调度、RetryPolicy 重试、RuntimeEvent 发布和失败状态推进。
8. RuntimeEvent 发布链路支持 metrics、observability 和可选 RabbitMQ publisher；RabbitMQ 默认关闭，不新增队列或修改既有 MQ 契约。
9. 新增 /workflow/runtime/metrics、/workflow/runtime/observability/{workflowId}、/workflow/runtime/events/{workflowId}。
10. WorkflowServiceImpl.startInstance 已由旧 TaskClient 首节点调度改为创建实例后交给 WorkflowRuntimeEngine 推进生命周期，并写回 SUCCESS/FAILED。
11. RuntimeLogContext 和 application.yml logging pattern 已支持 traceId、workflowId、nodeId、taskId。

验证记录：
1. 2026-05-28 17:17，先运行 mvn -pl backend/workflow-runtime-api -am test，按 TDD 预期失败：NodeType、NodeExecutor、WorkflowContext、NodeResult、NodeRegistry、RetryPolicy、RuntimeEvent 等协议类型尚不存在。
2. 2026-05-28 17:19，补齐 workflow-runtime-api 后运行 mvn -pl backend/workflow-runtime-api -am test，通过，workflow-runtime-api 10 tests，BUILD SUCCESS。
3. 2026-05-28 17:22，Context/状态机测试先失败于 RuntimeStateMachine/DefaultWorkflowContext 尚未实现。
4. 2026-05-28 17:23，补齐 Context/状态机后运行 mvn -pl backend/workflow-service -am test，通过，workflow-service 7 tests，BUILD SUCCESS。
5. 2026-05-28 17:24，DAG Engine 测试先失败于 WorkflowRuntimeEngine/WorkflowRuntimeRequest/WorkflowExecutionSnapshot 尚未实现。
6. 2026-05-28 17:27，DAG Engine 编译后发现 branch 图误走顺序兜底，已修正为只有无显式边时才使用 nodes 顺序兜底；随后测试通过。
7. 2026-05-28 17:30，Retry/Event/Metrics/Observability 测试先失败于相关类尚未实现。
8. 2026-05-28 17:33，补齐 Retry/Event/Metrics/Observability 后运行 mvn -pl backend/workflow-service -am test，通过，workflow-service 13 tests，BUILD SUCCESS。
9. 2026-05-28 17:35，Spring REST/MQ/config 测试先失败于 AMQP 依赖和配置/Controller/Publisher 尚未实现。
10. 2026-05-28 17:36，补齐 Spring 层后运行 mvn -pl backend/workflow-service -am test，通过，workflow-service 18 tests，BUILD SUCCESS。
11. 2026-05-28 17:38，WorkflowServiceImpl/RuntimeLogContext 测试先失败于旧 TaskClient 构造器和 RuntimeLogContext 尚未实现。
12. 2026-05-28 17:41，补齐 WorkflowServiceImpl Runtime 生命周期接入和 MDC helper 后运行 mvn -pl backend/workflow-service -am test，通过，workflow-service 21 tests，BUILD SUCCESS。
13. 2026-05-28 17:42，执行 git diff --name-only main...HEAD，通过，修改范围符合文件锁。
14. 2026-05-28 17:42，执行 git diff --check，通过，无 whitespace error。
15. 2026-05-28 17:46，执行 JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test，通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 21 tests；BUILD SUCCESS。

交接记录：
1. 完成 Workflow Runtime Platform Core 第一版。
2. 修改范围限定在 backend/workflow-runtime-api/**、backend/workflow-service/**、pom.xml、docs/superpowers/**、docs/agent/tasks/WORKFLOW-RUNTIME-CORE-20260528.md、docs/agent/logs/2026-05-28.md、AGENT.md。
3. 未修改 ai-service、gateway-service、auth-service、file-service、task-service、common、docker、frontend、python-ai-service、performance-test。
4. 未修改公共 DTO、既有 MQ 契约、数据库结构或 Gateway 路由。
5. 合入 main：已合入，主线合并提交 df6893c。
6. 统一运行电脑验证：未运行，需补测 workflow-service 启动、Runtime REST API、真实节点注册和真实基础设施连接。
7. 文件锁：RELEASED。

自审修复记录：
1. 2026-05-28 17:48，释放文件锁后本地自审发现 NodeExecutor、observability progress、Rabbit disabled 测试和 retry error message 仍有小风险，已重新标记 IN_PROGRESS 并恢复文件锁为 ACTIVE，修复后重新验证并释放。
2. 2026-05-28 17:51，已修复：NodeExecutor.nodeType() 改为强制实现；WorkflowCompleted progress 返回 1.0；Rabbit disabled 测试改为 verifyNoInteractions；retry error message 兼容 null。
3. 2026-05-28 17:51，重新执行 JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test，通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 21 tests；BUILD SUCCESS。
4. 文件锁：RELEASED。

主线合入记录：
1. 2026-05-28 18:17，已从 origin/main 同步最新主线，执行 git merge --no-ff feature/WORKFLOW-RUNTIME-CORE-20260528-runtime-core -m "merge: workflow runtime core"，无冲突。
2. 主线合并提交：df6893c merge: workflow runtime core。
3. 2026-05-28 18:18，在 main 上执行 git diff --check HEAD^..HEAD，通过，无 whitespace error。
4. 2026-05-28 18:18，在 main 上执行 JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test，通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 21 tests；BUILD SUCCESS。
5. 合入 main：已合入。
6. 统一运行电脑验证：未运行，仍需在 192.168.101.68 补测 workflow-service 启动、Runtime REST API、真实节点注册和真实基础设施连接。
