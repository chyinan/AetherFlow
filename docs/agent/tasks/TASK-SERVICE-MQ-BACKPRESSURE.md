任务ID：TASK-SERVICE-MQ-BACKPRESSURE
任务名称：task-service MQ 堆积保护与 AI Workflow 背压治理
负责人：项目库所有者
Agent ID：爱沫酱
Session ID：SESSION-20260528-TASK-SERVICE-MQ-BACKPRESSURE-CODEX
分支：feature/TASK-SERVICE-MQ-BACKPRESSURE
状态：IN_PROGRESS

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
1. 当前 main 尚未合入 TASK-SERVICE-INIT，负责人已要求继续，因此本任务从 feature/TASK-SERVICE-INIT-task-service-scheduler 派生；合入时需要先合入初始化分支或按顺序处理 PR。
2. superpowers skill/tool 在当前会话不可用，工具搜索未找到；本任务按 AGENT.md claim-first 工作流执行。
3. RabbitMQ Management API 需要管理端口和账号可用；若统一环境未启用 management 插件，需要运维补启或改用 RabbitAdmin 被动声明能力。
4. Redis 是 Busy 状态跨实例共享关键依赖；Redis 不可用时只能本地兜底，跨实例一致性会下降。
5. 本任务新增 task-service 自有 /task/metrics 接口；不改 Gateway 路由，因此若经网关访问需要后续 Gateway 任务单独聚合。
