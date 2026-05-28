任务ID：WORKFLOW-RUNTIME-RELIABILITY-20260528
任务名称：Workflow Runtime Reliability
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1836-CODEX-WORKFLOW-RUNTIME-RELIABILITY
分支：feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability
状态：IN_PROGRESS

任务目标：
在已合入 main 的 Workflow Runtime Core 基础上，分阶段补齐企业级 Runtime 可靠性能力：
1. 第一阶段：真实 DAG 并行分支调度与 fan-in join。
2. 第二阶段：Runtime 执行快照持久化与 RUNNING / RETRYING 恢复。
3. 第三阶段：持久化 Runtime Event Stream 与按 workflowId 查询。
4. 第四阶段：跨进程 Workflow 锁，支持 acquire / renew / release / TTL 超时释放。

允许修改文件：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/**
3. pom.xml 如确实需要
4. docs/superpowers/**
5. docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md
6. docs/agent/logs/2026-05-28.md
7. AGENT.md

禁止修改文件：
1. backend/ai-service/**
2. backend/gateway-service/**
3. backend/auth-service/**
4. backend/file-service/**
5. backend/task-service/**
6. docker/**
7. frontend/**
8. backend/common/**
9. 公共 DTO
10. 既有 MQ 契约
11. Whisper / Summary / Export / Notify 业务逻辑

是否允许新增文件：是
允许新增的位置：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/**
3. docs/superpowers/**
4. docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md

是否允许修改接口：是，仅限 workflow-runtime-api Runtime 自有协议类型和 workflow-service Runtime 观测/事件查询接口；不修改公共 DTO 或 Gateway 路由。
是否允许修改数据库：是，仅限 workflow-service Runtime 自有可靠性表；新增表前必须在设计文档中说明表设计和原因。
是否允许修改配置：是，仅限 workflow-service Runtime 自有配置；pom.xml 仅在确需新增 Redis/持久化依赖时修改。

Agent 编码计划：
1. 完成 docs-only claim，并在 push 成功后才修改业务代码。
2. 写入 Runtime Reliability 设计文档和实施计划，明确 Runtime/Node 边界、并行调度、恢复、事件流和锁方案。
3. 第一阶段按 TDD 实现并行 DAG + join：先写失败测试覆盖并行分支同时执行、join 等待所有前置节点、分支失败 retry/fail。
4. 将现有单线程 readyQueue 调度替换为 Runtime 控制的 DAG scheduler，不让业务节点控制调度。
5. 第二阶段按 TDD 增加 RuntimeSnapshotRepository、快照模型和 RUNNING/RETRYING 恢复。
6. 第三阶段按 TDD 增加 RuntimeEventStore、持久化 publisher 和事件流查询。
7. 第四阶段按 TDD 增加 WorkflowRuntimeLock，优先使用 Redis SET NX PX + token 校验 renew/release；如本地依赖不可用则保留 DB 乐观锁 fallback 设计说明。
8. 每阶段运行对应单测，最终运行 git diff --check 和 mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test。

不会修改：
1. 不修改 ai-service、gateway-service、auth-service、file-service、task-service、docker、frontend。
2. 不修改 backend/common 或公共 DTO。
3. 不修改既有 MQ exchange、routing key、queue 或已有跨服务 MQ payload。
4. 不实现 Whisper、Summary、Export、Notify 业务节点逻辑。
5. 不让 NodeExecutor 推进 RuntimeState 或控制 DAG 调度。
6. 不引入巨型 switch / if else 节点调度。

是否涉及契约变更：是。仅限 workflow-service Runtime 自有 DB 表、Redis Key、Runtime API/协议类型；不修改公共 DTO、既有 MQ 契约、Gateway 路由或其他服务契约。

文件锁范围：
1. backend/workflow-runtime-api/**
2. backend/workflow-service/**
3. pom.xml
4. docs/superpowers/**
5. docs/agent/tasks/WORKFLOW-RUNTIME-RELIABILITY-20260528.md
6. docs/agent/logs/2026-05-28.md
7. AGENT.md

验证方式：
1. git diff --check
2. JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test

必须覆盖：
1. 并行分支同时执行。
2. fan-in join 等待所有前置节点。
3. 节点失败后的 retry / fail。
4. Runtime 重启恢复。
5. Event Stream 查询。
6. 同一 workflowInstance 跨进程锁互斥。
7. 锁超时释放。

当前风险：
1. Runtime 恢复、Event Stream 和跨进程锁会引入 workflow-service 自有 DB/Redis 契约，必须在设计文档和 AGENT 契约表中登记后再实现。
2. 当前 WorkflowDefinitionDTO 没有显式 edges 字段，只能继续从 node.config 的 next/nextNodes/branches/defaultNext 推导 DAG，不修改公共 DTO。
3. 并行分支同时写相同 variable key 会产生非确定性，计划由 Runtime 检测冲突并失败，避免按完成顺序覆盖。
4. Redis 分布式锁需要 workflow-service 增加 Redis 依赖和配置；如统一运行环境 Redis 不可用，需记录为统一运行电脑补测风险。
5. 恢复未完成 in-flight 节点可能导致业务节点重复执行，Runtime 会通过快照跳过已完成节点，但真实节点仍需保证自身幂等。

开工同步记录：
1. 已读取 AGENT.md 和 docs/COMMON_CONTRACTS.md。
2. 已读取已合入 main 的 workflow-runtime-api 与 workflow-service Runtime Core 代码。
3. 已检查 AGENT.md 文件锁表，WORKFLOW-RUNTIME-CORE-20260528 相关锁已 RELEASED，未发现本任务允许范围内 ACTIVE 冲突。
4. 当前 main 已通过 git pull --ff-only origin main 确认为最新。
5. 已从 main 创建分支 feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability。
6. 当前只进行 docs-only claim；claim push 成功前不修改业务代码。

环境检测：
1. git：git version 2.53.0.windows.3
2. java：openjdk version "17.0.19" 2026-04-21 LTS，Microsoft build 17.0.19+10-LTS
3. maven：Apache Maven 3.9.9，Java version 17.0.19
4. node：v24.15.0
5. npm：11.12.1
6. 操作系统：Windows 11 amd64
7. 检测时间：2026-05-28 18:36:13 +08:00
8. 不能执行的命令：无
9. 是否需要统一运行电脑补测：是，原因是 workflow-service 真实 MySQL/Redis/Nacos/RabbitMQ 链路需要统一运行环境验证。
