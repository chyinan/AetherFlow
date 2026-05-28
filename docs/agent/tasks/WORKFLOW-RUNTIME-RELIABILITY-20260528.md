任务ID：WORKFLOW-RUNTIME-RELIABILITY-20260528
任务名称：Workflow Runtime Reliability
负责人：陈胤安
Agent ID：chyinan
Session ID：SESSION-20260528-1836-CODEX-WORKFLOW-RUNTIME-RELIABILITY
分支：feature/WORKFLOW-RUNTIME-RELIABILITY-20260528-runtime-reliability
状态：DONE

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

第二阶段新增 Runtime 自有表：
1. 表名：af_workflow_runtime_snapshot。
2. 原因：服务重启后需要由 Runtime 恢复 RUNNING / RETRYING workflow 的 DAG 位置、已完成节点、失败节点、变量、nodeOutputs 和 workflow 定义快照；仅依赖内存观测状态无法跨进程恢复。
3. 字段：id、workflow_id、trace_id、task_id、definition_id、definition_json、runtime_state、current_node_ids_json、completed_node_ids_json、failed_node_ids_json、variables_json、node_outputs_json、created_at、updated_at。
4. 索引：workflow_id 唯一索引；runtime_state + updated_at 查询索引，用于启动恢复扫描。
5. 位置：backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql。
6. 边界：该表仅属于 workflow-service Runtime；未修改公共 DTO、既有 MQ 契约或 docker 初始化脚本，统一运行环境需手动应用 SQL 后联调。

第三阶段新增 Runtime 自有表：
1. 表名：af_workflow_runtime_event。
2. 原因：RuntimeEvent 需要脱离内存观测和 MQ 持久化，支持服务重启后按 workflowId 回放事件流，并从事件流重建 Runtime Observability。
3. 字段：id、event_id、workflow_id、trace_id、task_id、event_type、node_id、runtime_state、occurred_at、attributes_json、created_at、updated_at。
4. 索引：event_id 唯一索引用于事件幂等写入；workflow_id + occurred_at + id 查询索引用于按 workflowId 顺序回放。
5. 位置：backend/workflow-service/src/main/resources/db/workflow-runtime-reliability.sql。
6. 边界：该表仅属于 workflow-service Runtime Event Stream；未修改既有 MQ exchange、routing key、queue 或 Rabbit payload 契约。

第四阶段新增 Runtime 自有锁：
1. 锁 key：aetherflow:workflow:runtime:lock:{workflowId}。
2. 方案：Redis SET NX PX 获取锁，Lua 脚本基于 token 做 renew / release 校验，避免误续租或误删别的 worker 的锁。
3. 原因：跨进程互斥要求低延迟、TTL 自动释放和 token 校验；Redis 适合做 Runtime 入口锁，比 DB 乐观锁更直接，也不需要额外锁表和轮询。
4. 边界：锁仅保护 workflow-service Runtime 入口，不改公共 DTO、既有 MQ 契约或其他服务业务逻辑。
5. 位置：backend/workflow-service/pom.xml；backend/workflow-service/src/main/resources/application.yml；backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/lock/**。

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

实施记录：
1. docs-only claim 已提交并推送：f95a25f docs(agent): claim WORKFLOW-RUNTIME-RELIABILITY-20260528。
2. Runtime Reliability 设计文档已写入 docs/superpowers/specs/2026-05-28-workflow-runtime-reliability-design.md。
3. Runtime Reliability 实施计划已写入 docs/superpowers/plans/2026-05-28-workflow-runtime-reliability.md。
4. 设计与计划提交已推送：03ed440 docs(workflow): plan runtime reliability。
5. 第一阶段已完成：WorkflowDag 从单纯 next-node resolver 扩展为 DAG 图模型，支持 startNodeIds、nodeIds、predecessorNodeIds、requiredPredecessorCount。
6. 第一阶段已完成：WorkflowRuntimeEngine 从单线程 readyQueue 改为 Runtime-owned CompletionService 并行调度，fan-out 分支可并发执行，fan-in join 等待所有前置节点完成。
7. 第一阶段已完成：并行分支失败继续由 Runtime 使用 RetryPolicy 统一 retry；retry 耗尽后 Runtime 进入 FAILED，不调度 join。
8. 第一阶段已完成：NodeResult.nextNodeId 只能跳转到 DAG 已声明边，不能让业务节点任意控制调度。
9. 第一阶段未修改公共 DTO、既有 MQ 契约、其他服务或业务节点逻辑。
10. 第一阶段代码已提交并推送：dd85e64 feat(workflow): add parallel dag join scheduling。
11. 第二阶段已完成：WorkflowExecutionSnapshot 扩展 currentNodeIds、failedNodeIds，保留旧构造器兼容现有调用。
12. 第二阶段已完成：新增 RuntimeSnapshotRepository、WorkflowRuntimeSnapshot、InMemoryRuntimeSnapshotRepository 和 MybatisRuntimeSnapshotRepository，支持快照保存、按 workflowId 查询和 RUNNING / RETRYING 扫描。
13. 第二阶段已完成：WorkflowRuntimeEngine 在 execute / resume 生命周期内由 Runtime 写入快照，恢复时跳过已完成节点并还原变量与 nodeOutputs。
14. 第二阶段已完成：新增 WorkflowRuntimeRecoveryService 与 WorkflowRuntimeRecoveryRunner，服务启动时可按配置恢复 recoverable workflow；缺表等运行环境问题只记录 warn，不阻断服务启动。
15. 第二阶段已完成：workflow-service application.yml 增加 aetherflow.workflow.runtime.recovery.enabled 与 scan-limit 配置。
16. 第二阶段未修改公共 DTO、既有 MQ 契约、其他服务或业务节点逻辑。
17. 第二阶段代码已提交：864d0a5 feat(workflow): add runtime snapshot recovery。
18. 第三阶段已完成：新增 RuntimeEventStore、PersistentRuntimeEventPublisher、MybatisRuntimeEventStore、RuntimeEventEntity 和 WorkflowRuntimeEventMapper，RuntimeEvent 可写入 workflow-service 自有 DB 表。
19. 第三阶段已完成：WorkflowRuntimeConfig 将 persistent publisher 加入 CompositeRuntimeEventPublisher，保持 metrics、内存观测、DB 持久化、Rabbit MQ 发布解耦。
20. 第三阶段已完成：WorkflowRuntimeController 的 /workflow/runtime/events/{workflowId} 改为从持久化 Event Stream 查询。
21. 第三阶段已完成：新增 RuntimeObservationRebuilder，当内存观测缺失时可从持久化事件流重建 WorkflowRuntimeObservation。
22. 第三阶段已完成：WorkflowRuntimeController 保留旧的二参构造兼容 standalone 测试，旧路径可继续从 InMemoryRuntimeObservationStore 读取事件。
23. 第三阶段未修改公共 DTO、既有 MQ 契约、其他服务或业务节点逻辑。
24. 第三阶段代码已提交：4fb54cd feat(workflow): persist runtime event stream。
25. 第四阶段已完成：新增 WorkflowRuntimeLock、WorkflowRuntimeLockLease 和 RedisWorkflowRuntimeLock，支持 acquire / renew / release / TTL 自动释放。
26. 第四阶段已完成：workflow-service pom.xml 增加 spring-boot-starter-data-redis，application.yml 增加 spring.data.redis 与 workflow runtime lock 配置。
27. 第四阶段已完成：WorkflowRuntimeEngine 在 execute / resume 入口统一 acquire 锁，执行结束后 release，并按 lease.ttl 进行 renewal heartbeat。
28. 第四阶段已完成：WorkflowRuntimeConfig 将 lock bean 注入 WorkflowRuntimeEngine，不让业务节点控制锁或 RuntimeState。
29. 第四阶段已完成：新增 RedisWorkflowRuntimeLockTest 与 WorkflowRuntimeEngineLockTest，覆盖互斥、renew / release、TTL、获取失败和执行释放。
30. 第四阶段代码已提交：e2ce521 feat(workflow): add redis runtime lock。
31. 已按负责人指令合入 main：be8f848 merge: workflow runtime reliability。

TDD 记录：
1. WorkflowDagTest 先失败于 startNodeIds、predecessorNodeIds、requiredPredecessorCount 缺失，随后补齐 DAG 图索引后通过。
2. WorkflowRuntimeEngineTest#executesFanOutBranchesConcurrently 先失败于 LEFT 完成后 RIGHT 才启动，随后并行调度实现后通过。
3. 补充 fanInJoinWaitsForEveryPredecessor，验证 join 不会在慢分支完成前启动。
4. 补充 retriesFailedParallelBranchAndThenRunsJoin，验证并行分支 retry 成功后才运行 join。
5. 补充 failsWorkflowWhenParallelBranchExhaustsRetryAndDoesNotRunJoin，验证并行分支 retry 耗尽后 workflow 失败且 join 不启动。
6. 补充 rejectsRuntimeNextNodeThatWasNotDeclaredInDag，验证业务节点不能通过 NodeResult.nextNodeId 跳到未声明边。
7. WorkflowRuntimeRecoveryTest 先失败于 WorkflowRuntimeEngine 缺少 resume 能力，随后补齐恢复入口后通过。
8. WorkflowRuntimeRecoveryServiceTest 先验证 RUNNING / RETRYING 恢复与 SUCCESS 跳过；补齐恢复服务后通过。
9. MybatisRuntimeSnapshotRepositoryTest 先失败于持久化 repository 缺失，随后补齐 JSON 序列化实体与 mapper 后通过。
10. WorkflowRuntimeRecoveryRunnerTest 先失败于恢复配置和启动 runner 缺失，随后补齐 properties 与 ApplicationRunner 后通过。
11. 补充快照恢复变量和 nodeOutputs 的断言，确保恢复逻辑由 Runtime 控制。
12. 补充最终快照保存断言，确保恢复完成后 repository 中记录 SUCCESS 终态。
13. PersistentRuntimeEventPublisherTest 先失败于 RuntimeEventStore / PersistentRuntimeEventPublisher 缺失，随后补齐 publisher 写入 store 后通过。
14. MybatisRuntimeEventStoreTest 先失败于 WorkflowRuntimeEventMapper、RuntimeEventEntity、MybatisRuntimeEventStore 缺失，随后补齐 JSON 序列化和 workflowId 查询后通过。
15. RuntimeObservationRebuilderTest 先失败于 RuntimeObservationRebuilder 缺失，随后通过事件流回放重建 WorkflowRuntimeObservation。
16. WorkflowRuntimeControllerTest 先失败于 controller 尚未注入 RuntimeEventStore，随后补齐持久化事件查询和观测 fallback 后通过。
17. WorkflowRuntimeConfigTest 补充 composite publisher 持久化写入断言，确保 Runtime 发布的事件会进入 DB Event Stream。
18. RedisWorkflowRuntimeLockTest 先失败于 Redis 依赖和 Runtime lock 类型缺失，随后补齐 Redis SET NX PX + token Lua renew/release 后通过。
19. WorkflowRuntimeEngineLockTest 先失败于 RuntimeEngine 缺少 lock 构造与入口保护，随后补齐 execute / resume 入口锁后通过。

验证记录：
1. 2026-05-28 18:45，mvn -pl backend/workflow-service -am -Dtest=WorkflowDagTest test 首次被 common 模块 surefire 无匹配测试拦截；随后使用 -Dsurefire.failIfNoSpecifiedTests=false 重新运行。
2. 2026-05-28 18:45，mvn -pl backend/workflow-service -am -Dtest=WorkflowDagTest -Dsurefire.failIfNoSpecifiedTests=false test 按 TDD 预期失败：WorkflowDag 缺少 startNodeIds、predecessorNodeIds、requiredPredecessorCount。
3. 2026-05-28 18:47，补齐 WorkflowDag 图索引后，WorkflowDagTest 2 tests 通过。
4. 2026-05-28 19:48，executesFanOutBranchesConcurrently 按 TDD 预期失败：LEFT 完成后 RIGHT 才启动。
5. 2026-05-28 19:50，补齐并行调度后，executesFanOutBranchesConcurrently 通过。
6. 2026-05-28 19:51，fanInJoinWaitsForEveryPredecessor 通过。
7. 2026-05-28 19:52，retriesFailedParallelBranchAndThenRunsJoin 通过。
8. 2026-05-28 19:52，failsWorkflowWhenParallelBranchExhaustsRetryAndDoesNotRunJoin 通过。
9. 2026-05-28 19:53，mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeEngineTest,WorkflowDagTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：10 tests，BUILD SUCCESS。
10. 2026-05-28 19:55，git diff --check 通过，无 whitespace error。
11. 2026-05-28 19:55，JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test 通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 28 tests；BUILD SUCCESS。
12. 2026-05-28 20:20，mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeRecoveryTest,WorkflowRuntimeRecoveryServiceTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：2 tests，BUILD SUCCESS。
13. 2026-05-28 20:21，mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeRecoveryRunnerTest,MybatisRuntimeSnapshotRepositoryTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：4 tests，BUILD SUCCESS。
14. 2026-05-28 20:21，mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeRecoveryTest,WorkflowRuntimeRecoveryServiceTest,WorkflowRuntimeRecoveryRunnerTest,MybatisRuntimeSnapshotRepositoryTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：6 tests，BUILD SUCCESS。
15. 2026-05-28 20:26，git diff --check 通过，无 whitespace error，仅 Windows LF/CRLF 提示。
16. 2026-05-28 20:26，JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test 通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 34 tests；BUILD SUCCESS。
17. 2026-05-28 20:39，mvn -pl backend/workflow-service -am -Dtest=PersistentRuntimeEventPublisherTest,MybatisRuntimeEventStoreTest,RuntimeObservationRebuilderTest,WorkflowRuntimeControllerTest -Dsurefire.failIfNoSpecifiedTests=false test 按 TDD 预期失败：缺少 RuntimeEventStore、WorkflowRuntimeEventMapper、MybatisRuntimeEventStore、RuntimeEventEntity。
18. 2026-05-28 20:42，补齐 Runtime Event Store 后，mvn -pl backend/workflow-service -am -Dtest=PersistentRuntimeEventPublisherTest,MybatisRuntimeEventStoreTest,RuntimeObservationRebuilderTest,WorkflowRuntimeControllerTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：7 tests，BUILD SUCCESS。
19. 2026-05-28 20:45，补充 config 集成测试后，mvn -pl backend/workflow-service -am -Dtest=WorkflowRuntimeConfigTest,PersistentRuntimeEventPublisherTest,MybatisRuntimeEventStoreTest,RuntimeObservationRebuilderTest,WorkflowRuntimeControllerTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：9 tests，BUILD SUCCESS。
20. 2026-05-28 21:00，mvn -pl backend/workflow-service -am -Dtest=RedisWorkflowRuntimeLockTest,WorkflowRuntimeEngineLockTest -Dsurefire.failIfNoSpecifiedTests=false test 按 TDD 预期失败：缺少 WorkflowRuntimeLock、WorkflowRuntimeLockLease、RedisWorkflowRuntimeLock 和 Spring Data Redis 依赖。
21. 2026-05-28 21:06，补齐 Redis workflow runtime lock 后，mvn -pl backend/workflow-service -am -Dtest=RedisWorkflowRuntimeLockTest,WorkflowRuntimeEngineLockTest -Dsurefire.failIfNoSpecifiedTests=false test 通过：8 tests，BUILD SUCCESS。
22. 2026-05-28 21:18，git diff --check 通过，无 whitespace error，仅 Windows LF/CRLF 提示。
23. 2026-05-28 21:18，JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test 通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 48 tests；BUILD SUCCESS。
24. 2026-05-28 21:29，main 上 git diff --check HEAD^..HEAD 通过，无 whitespace error。
25. 2026-05-28 21:29，main 上 JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot; mvn -pl backend/workflow-runtime-api,backend/workflow-service -am test 通过：common 8 tests；workflow-runtime-api 10 tests；workflow-service 48 tests；BUILD SUCCESS。

当前阶段状态：
1. 第一阶段“并行 DAG + join”已完成并验证。
2. 第二阶段“Runtime 持久化与恢复”已完成并验证。
3. 第三阶段“Event Stream”已完成并验证。
4. 第四阶段“分布式锁”已完成并验证。
5. 任务整体已合入 main，状态 DONE。
6. 统一运行电脑 192.168.101.68 尚未执行真实 MySQL、Redis、Nacos、RabbitMQ 全链路补测。
