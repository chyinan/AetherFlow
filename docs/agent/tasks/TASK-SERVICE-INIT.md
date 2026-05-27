任务ID：TASK-SERVICE-INIT
任务名称：task-service 分布式任务调度微服务初始化
负责人：项目库所有者
Agent ID：爱沫酱
Session ID：SESSION-20260527-TASK-SERVICE-INIT-CODEX
分支：feature/TASK-SERVICE-INIT-task-service-scheduler
状态：DONE

任务目标：
初始化并完善 task-service 分布式任务调度微服务，实现异步任务创建、RabbitMQ 投递、消费任务、重试机制、超时处理、死信队列、XXL-Job 补偿入口、Redis 状态缓存、Swagger 和 health 能力。

允许修改文件：
1. backend/task-service/**
2. backend/ai-service/src/main/java/com/aetherflow/ai/client/TaskStatusClient.java
3. backend/ai-service/src/main/java/com/aetherflow/ai/callback/AiTaskCallbackService.java
4. backend/ai-service/src/test/java/com/aetherflow/ai/callback/**
5. docs/agent/tasks/TASK-SERVICE-INIT.md

禁止修改文件：
1. workflow-service/**
2. gateway-service/**
3. auth-service/**
4. common/**
5. docker/**
6. 根目录 pom.xml
7. 公共 DTO、公共 MQ 契约、数据库初始化 SQL、Gateway 路由

是否允许新增文件：是
允许新增的位置：
1. backend/task-service/src/main/java/com/aetherflow/task/**
2. backend/task-service/src/test/java/com/aetherflow/task/**
3. docs/agent/tasks/TASK-SERVICE-INIT.md

是否允许修改接口：是，仅允许新增 task-service 内部状态回写接口 /internal/tasks/{id}/succeeded，供 ai-service 推理成功后回写任务终态；保持 TaskMessageDTO、/internal/tasks/dispatch、/tasks/{id}、公共 DTO、MQ、DB、Gateway 契约不变。
是否允许修改数据库：否，使用现有 af_task_record 表，不修改 docker/mysql/init/01-aetherflow.sql，不新增公共数据库结构。
是否允许修改配置：是，仅限 backend/task-service/src/main/resources/application.yml、backend/task-service/pom.xml、backend/task-service/src/main/java/com/aetherflow/task/config/**

Agent 编码计划：
1. 梳理 task-service 当前骨架，保留现有 Nacos、RabbitMQ、Redis、XXL-Job、Swagger 和 health 基础配置。
2. 在 task-service 内新增任务状态枚举、调度属性、消息重建与状态流转服务，避免修改 common 契约和数据库结构。
3. 实现 TaskQueueProducer，统一 MQ 投递、Redis 状态缓存和投递异常处理。
4. 实现 TaskQueueConsumer，消费现有 AI 任务队列消息并更新任务状态；失败时按最大重试次数决定重新投递或转入死信队列。
5. 实现 RetryManager，扫描到期待重试任务并重新投递。
6. 实现 TimeoutChecker，扫描超时 RUNNING/PENDING 任务并交给 RetryManager 或 DLQ。
7. 实现死信队列消费和任务 FAILED 状态落库。
8. 补齐 Swagger 注解、日志、异常处理和 focused 单元测试。

不会修改：
1. workflow-service、gateway-service、auth-service、common、docker。
2. 公共 DTO、RabbitMqNames、公共 Result、错误码。
3. 数据库 SQL 和公共数据库结构。
4. Gateway 路由和全局契约。

是否涉及契约变更：是，仅新增 task-service 内部状态回写接口 /internal/tasks/{id}/succeeded；不修改公共 DTO、MQ、DB、Gateway 或既有外部接口。
文件锁范围：
1. backend/task-service/**
2. backend/ai-service/src/main/java/com/aetherflow/ai/client/TaskStatusClient.java
3. backend/ai-service/src/main/java/com/aetherflow/ai/callback/AiTaskCallbackService.java
4. backend/ai-service/src/test/java/com/aetherflow/ai/callback/**
5. docs/agent/tasks/TASK-SERVICE-INIT.md

验证方式：
1. mvn -pl backend/task-service -am test
2. mvn -pl backend/task-service -am package -DskipTests
3. RabbitMQ、Redis、Nacos、XXL-Job 运行态联调如本机不可用，记录为需要统一运行电脑补测。

环境检测：
- git：git version 2.51.0
- java：openjdk version "17.0.19" 2026-04-21
- maven：Apache Maven 3.9.11，Java version 17.0.19
- node：v24.14.1
- npm：11.11.0
- 操作系统：mac os x 26.4.1 aarch64
- 检测时间：2026-05-27 19:51:07 CST
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，基础设施运行态需要统一环境验证。

当前风险：
1. 现有 af_task_record 表字段较少，不能新增失败原因、锁版本、超时字段等数据库列，只能在现有字段内实现状态流转、重试和超时策略。
2. ai-service 当前监听 aetherflow.ai.task.queue，本任务通过 task-service 内部调度队列转投现有 AI 任务队列，并在成功后回写 task-service SUCCEEDED；运行态需要统一联调确认跨服务消息链路。
3. RabbitMQ、Redis、Nacos、XXL-Job 依赖外部基础设施，本机 Maven 验证不能替代统一运行环境验证。

验证记录：
1. 2026-05-27 20:10，本机执行 mvn -pl backend/task-service -am test，提升权限写入 ~/.m2 后通过；基线 Tests run: 8, Failures: 0, Errors: 0, Skipped: 0。
2. 2026-05-27 20:18，本机执行 mvn -pl backend/task-service -am test，通过；common Tests run: 8，task-service Tests run: 8，Failures: 0，Errors: 0。
3. 2026-05-27 20:19，本机执行 mvn -pl backend/task-service -am package -DskipTests，提升权限写入 ~/.m2 后通过，task-service boot jar 重新打包成功。
4. 2026-05-27 20:19，本机执行 git diff --check，通过。
5. 2026-05-27 21:40，Review 修复前执行 mvn -pl backend/ai-service,backend/task-service -am test，按 TDD 预期失败；缺失 TaskDispatchServiceImpl.markSucceeded 行为。
6. 2026-05-27 21:43，Review 修复后执行 mvn -pl backend/ai-service,backend/task-service -am test，通过；common Tests run: 8，task-service Tests run: 12，ai-service Tests run: 9，Failures: 0，Errors: 0。
7. 2026-05-27 21:59，合入 main 后执行 mvn test，通过；common 8、gateway-service 13、task-service 12、ai-service 9 个测试通过，Failures: 0，Errors: 0。
8. 2026-05-27 21:59，合入 main 后执行 mvn package -DskipTests，通过，全部后端模块 jar/boot jar 构建成功。

提交记录：
1. docs(agent): claim TASK-SERVICE-INIT：6e6ff08
2. feat(task): initialize task scheduler service：4bf8fa9
3. docs(agent): handoff TASK-SERVICE-INIT：d6218f8
4. fix(task): harden scheduler merge readiness：4e1b500

交接记录：
1. 已完成 task-service 初始化和调度核心实现，并已由负责人本地 fast-forward 合入 main。
2. 未修改 workflow-service、gateway-service、auth-service、common、docker、根 pom.xml、公共 DTO、RabbitMqNames、数据库 SQL、Gateway 路由。
3. 新增 task-service 内部调度队列 aetherflow.task.scheduler.queue，HTTP dispatch 先落库并投递内部队列，TaskQueueConsumer 再转投现有 AI 任务队列，避免直接消费 ai-service 的公共队列。
4. Review 修复新增 /internal/tasks/{id}/succeeded，ai-service 推理成功后回写 task-service SUCCEEDED，避免成功任务因 DISPATCHED 超时被重复投递。
5. Review 修复将 MQ 投递延后到数据库事务提交后执行，避免事务回滚后队列中残留无对应 DB 记录的消息。
6. Review 修复恢复 /tasks/{id} 未找到时 success/null 的既有返回语义，避免未登记的查询契约变化。
7. 已实现 Redis 状态缓存、任务状态流转、RetryManager、TimeoutChecker、死信队列消费、XXL-Job 补偿入口和 Swagger 注解。
8. 合入 main：已合入本地 main；随本次 docs close 提交推送 origin/main 后生效。
9. 统一运行电脑验证：未运行；RabbitMQ、Redis、Nacos、XXL-Job 运行态仍需统一运行电脑联调验证。
10. 文件锁：RELEASED
