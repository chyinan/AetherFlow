任务ID：TASK-SERVICE-MQ-BACKPRESSURE
任务名称：task-service MQ 堆积保护与 AI Workflow 背压治理
负责人：项目库所有者
Agent ID：爱沫酱
Session ID：SESSION-20260528-TASK-SERVICE-MQ-BACKPRESSURE-CODEX
分支：feature/TASK-SERVICE-MQ-BACKPRESSURE
状态：REVIEW

任务目标：
在 task-service 内实现企业级 MQ 堆积保护机制，实时监控 RabbitMQ 队列 ready/unacked/consumer 指标，超过高水位阈值时拒绝新的 AI Task 创建并向 workflow-service 返回明确背压错误；队列恢复到低水位后自动恢复调度。通过 Redis 缓存 Queue Health、AI Service Busy 状态和拒绝计数，并结合 Sentinel 对 AI 调度和 MQ 消费转投做限流保护，提供 /task/metrics 观测接口。

允许修改文件：
1. backend/task-service/**
2. docs/agent/tasks/TASK-SERVICE-MQ-BACKPRESSURE.md

禁止修改文件：
1. workflow-service/**
2. gateway-service/**
3. ai-service/**
4. auth-service/**
5. common/**
6. docker/**
7. 根目录 pom.xml
8. 公共 DTO、公共 MQ 契约、数据库初始化 SQL、Gateway 路由

是否允许新增文件：是
允许新增的位置：
1. backend/task-service/src/main/java/com/aetherflow/task/**
2. backend/task-service/src/test/java/com/aetherflow/task/**
3. docs/agent/tasks/TASK-SERVICE-MQ-BACKPRESSURE.md

是否允许修改接口：是，仅允许 task-service 内新增 GET /task/metrics 观测接口，不修改既有接口路径、请求参数、响应结构。
是否允许修改数据库：否，不能修改 docker/mysql/init/01-aetherflow.sql，不能新增表字段或公共数据库结构。
是否允许修改配置：是，仅限 backend/task-service/src/main/resources/application.yml 和 backend/task-service/src/main/java/com/aetherflow/task/config/**

Agent 编码计划：
1. 在 task-service 配置中增加 Queue Threshold、RabbitMQ Management API、Redis 缓存、Sentinel 调度保护参数。
2. 新增 QueueMonitorService，定时监控多个队列的 ready、unacked、total、consumer 数，维护高水位 Busy 和低水位恢复状态。
3. 新增 RabbitMQ 队列指标客户端，优先使用 HTTP Management API 获取实时 Queue Depth，并对失败做异常日志和保守降级。
4. 新增 QueueBackpressureGuard，在 TaskDispatchServiceImpl 创建任务前执行背压检查，Busy 时拒绝新 AI Task 并记录拒绝计数。
5. 在 Redis 缓存 QUEUE_STATUS、Queue Health 快照、AI_SERVICE_BUSY、拒绝任务计数；Redis 异常时用本地 AtomicLong/内存快照兜底。
6. 对 TaskQueueConsumer 转投 AI 队列增加 Sentinel 资源保护，限流时进入既有 retry/DLQ 流程，避免压垮 ai-service。
7. 新增 /task/metrics，返回队列深度、ready、unacked、consumer 数、busy 状态、拒绝任务数和最近检查时间。
8. 编写 focused 单元测试，覆盖高水位拒绝、低水位恢复、Redis 缓存、Metrics 输出、Sentinel 拦截分支。

不会修改：
1. workflow-service、gateway-service、ai-service、auth-service、common、docker。
2. 公共 DTO、RabbitMqNames、公共 Result、错误码。
3. 数据库 SQL 和公共数据库结构。
4. Gateway 路由和全局契约。

是否涉及契约变更：否；仅新增 task-service 自有 /task/metrics 观测接口，且不改变跨服务 DTO、MQ、数据库、Gateway 契约。
文件锁范围：
1. backend/task-service/**
2. docs/agent/tasks/TASK-SERVICE-MQ-BACKPRESSURE.md

验证方式：
1. mvn -pl backend/task-service -am test
2. mvn -pl backend/task-service -am package -DskipTests
3. git diff --check
4. RabbitMQ、Redis、Nacos、Sentinel、XXL-Job 运行态需要统一虚拟机 192.168.101.68 补测。

环境检测：
- git：git version 2.51.0
- java：openjdk version "17.0.19" 2026-04-21；统一后端环境要求 jdk-17.0.19.10-hotspot
- maven：Apache Maven 3.9.11，Java version 17.0.19
- node：未执行，后端任务非必须
- npm：未执行，后端任务非必须
- 操作系统：mac os x 26.4.1 aarch64
- 检测时间：2026-05-28 10:03:58 CST
- 不能执行的命令：无
- 是否需要统一运行电脑补测：是，基础设施运行态需要统一环境验证。

当前风险：
1. RabbitMQ Management API 需要管理端口和账号可用；若统一环境未启用 management 插件，需要运维补启或改用 RabbitAdmin 被动声明能力。
2. Redis 是 Busy 状态跨实例共享关键依赖；Redis 不可用时只能本地兜底，跨实例一致性会下降。
3. 本任务新增 task-service 自有 /task/metrics 接口；不改 Gateway 路由，因此若经网关访问需要后续 Gateway 任务单独聚合。
4. RabbitMQ Management API、Redis、Sentinel Dashboard、Nacos 和 XXL-Job 运行态仍需要统一虚拟机 192.168.101.68 补测。

验证记录：
1. 2026-05-28 10:14，本机执行 mvn -pl backend/task-service -am test，通过；common Tests run: 8，task-service Tests run: 13，Failures: 0，Errors: 0。
2. 2026-05-28 10:14，本机执行 mvn -pl backend/task-service -am package -DskipTests，通过，task-service boot jar 重新打包成功。
3. 2026-05-28 10:15，本机执行 git diff --check，通过。
4. RabbitMQ Management API、Redis、Sentinel Dashboard、Nacos 和 XXL-Job 运行态未在本机联调，需要统一虚拟机 192.168.101.68 补测。
5. 2026-05-28 11:06，负责人复审修复后执行 mvn -pl backend/task-service -am test，通过；common Tests run: 8，task-service Tests run: 16，Failures: 0，Errors: 0。
6. 2026-05-28 11:07，负责人复审修复后执行 mvn -pl backend/task-service -am package -DskipTests，通过，task-service boot jar 重新打包成功。

交接记录：
1. 已完成 task-service MQ 堆积保护增强开发，修改范围限制在 backend/task-service/** 和 docs/agent/tasks/TASK-SERVICE-MQ-BACKPRESSURE.md。
2. 未修改 workflow-service、gateway-service、ai-service、auth-service、common、docker、根 pom.xml、公共 DTO、RabbitMqNames、数据库 SQL、Gateway 路由。
3. 新增 QueueMonitorService，定时监控 RabbitMQ ready/unacked/total/consumer 指标，支持多队列、Busy 高水位、Recovery 低水位和监控异常兜底。
4. 新增 Redis Queue Health 缓存，写入 aetherflow:task:queue:status、aetherflow:task:queue:health、aetherflow:task:ai-service:busy、aetherflow:task:queue:rejected-count。
5. 创建任务入口接入 QueueBackpressureGuard，Busy 时拒绝创建并返回“系统繁忙，请稍后重试”。
6. Consumer 转投 AI 队列前接入 Sentinel 资源保护，触发限流后进入既有 retry/DLQ 流程。
7. 新增 GET /task/metrics，返回队列深度、ready、unacked、consumer 数、Busy 状态、拒绝任务数和最近检查时间。
8. 当前工作区存在未跟踪 .Rhistory，本任务未修改、未暂存、未提交该文件。
9. 2026-05-28 10:24 发现分支历史中包含非本任务白名单的 AGENT.md 文档提交 e9ac985，已用 1fb15eb revert 撤回；最终 diff 不包含 AGENT.md。
10. 2026-05-28 11:05 按项目库管理员指示保留 AGENT.md 和 docs/COMMON_CONTRACTS.md 权威口径，最终 AGENT.md 与 origin/main 保持一致，避免合并冲突。
11. 2026-05-28 11:05 修复 QueueMonitorService 生产风险：RabbitMQ Management API 异常时按 fail-open/fail-closed 和上一状态写入 NORMAL/BUSY 快照，不再保持 UNKNOWN，避免任务创建热路径反复同步请求管理 API。
12. 2026-05-28 11:05 修复拒绝计数回退风险：Redis 计数恢复但值落后于本地兜底计数时，拒绝计数保持单调递增。
