# AetherFlow 工业可投产整改设计

## Summary

修复开题报告与当前项目审查中发现的重复执行、跨节点数据契约、能力预检、多副本一致性和容量边界问题。继续使用现有 Spring Cloud、MySQL、Redis、RabbitMQ、MinIO 和 Swarm 体系，以持久化 Outbox、数据库 CAS、租约和明确的运行时能力快照保证正确性，再用真实环境门禁验证吞吐与恢复能力。

## Definition of Done

1. 工作流启动、AI 制品、任务超时/重试和通知在并发、重启、重复消息和部分失败下不重复执行、不丢失、不永久卡死。
2. 开题报告承诺的工作流复制/模板、FFmpeg→Whisper、节点配置校验、状态通知和 Provider 容错具备真实前后端闭环；不可运行能力由后端 fail-closed，前端只做提前反馈。
3. 运行事件、知识检索和 Embedding 具备可控的查询规模、持久化边界、保留策略和资源预算；多副本定时任务使用可证明的 claim/CAS。
4. 部署与验证脚本明确区分开发单机、Swarm 多副本和外部 HA 数据服务；容量、浸泡、故障注入、恢复、重复率和 RPO/RTO 没有实际证据时不得判为通过。

## Glossary

- **Outbox**：与业务状态同一数据库事务写入、由后台可靠派发的待处理记录。
- **CAS**：Compare-And-Set，更新时带上期望状态/版本，只有一个并发执行者可以成功。
- **租约**：带过期时间和持有者 token 的执行权，允许崩溃后被其他 worker 接管。
- **Fail-closed**：依赖或能力无法确认时拒绝执行，不把未知当作可用。
- **Artifact**：工作流产生的文件制品，例如音频、字幕、图片和导出文档。

## Architecture

### 1. 工作流启动

工作流实例和启动 Outbox 在同一个本地事务中落库。HTTP 请求不直接执行 Runtime，只负责提交记录；启动派发器先 CAS claim `PENDING`，成功后提交运行线程，运行开始后将该条记录标记 `DISPATCHED`。崩溃恢复只处理超时的 `DISPATCHING` 或已 claim 但无持久快照的记录，并跳过终态实例。

### 2. 节点输出契约

FFmpeg、Whisper、图像等制品节点统一返回租户归属的文件元数据，并将 `fileId`、`fileUrl` 和 `objectKey` 写入工作流变量。结果适配器和前端 catalog 使用同一变量命名，保证节点输出可以被后继节点绑定。

### 3. 多副本状态推进

所有定时扫描任务先执行数据库 claim，再执行外部副作用。任务超时、重试和死信使用状态条件更新与幂等消息键；AI Job 继续使用已有 lease/fencing。通知和 AI Outbox 继续使用已有唯一事件键与 Redis fanout。

### 4. 查询与容量边界

运行事件查询在存储层支持游标和 LIMIT，SSE/WS 每次只取固定窗口。知识语义检索保持全量候选语义，但限制单次查询最大数据集规模、扫描页数、向量维度和执行耗时；Embedding 默认使用持久化向量存储，内存存储只允许显式开发模式。

### 5. 生产部署与证据

保留 Compose 作为单机开发拓扑，使用 `docker-stack.yml` 作为 Swarm 多副本入口；状态服务通过外部 HA 集群接入。容量脚本必须生成环境快照和指标摘要，明确实际执行了阶梯、峰值、浸泡和故障恢复中的哪些阶段。

## Existing Patterns

- 复用现有 Workflow Runtime 的 Redis 工作流锁、Runtime Snapshot、事件游标和 `RuntimeState`。
- 复用 AI Job 的 lease/heartbeat/fencing 和 AI Event Outbox。
- 复用 file-service 的生成制品状态机、幂等键、租户校验和 MinIO 对账清理。
- 复用前端 API module、mapper、Pinia store 和 `runtimeEnv` 的真实接口优先策略。
- 新增纯状态转换/校验逻辑放在 Functional Core；数据库、HTTP、MQ、文件操作放在 Imperative Shell，并为修改的应用源码保留 pattern 注释。

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: 工作流启动可靠性

**Goal:** 消除启动 Outbox 导致的周期性重复执行，并覆盖正常、并发、重启和终态场景。

**Components:** `workflow-service` 启动服务、Outbox mapper、恢复 job、WorkflowServiceImpl 测试和数据库迁移/约束。

**Dependencies:** 现有 Runtime Snapshot、Redis 锁和启动 Outbox 表。

**Done when:** 正常启动后 Outbox 进入终态；同一实例只能被一个派发者启动；成功/失败/取消实例不会再次调度；测试覆盖重复调用和恢复。
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: 功能契约和能力门禁

**Goal:** 让报告承诺的节点组合、配置校验、复制/模板、通知和 Provider 容错具备真实闭环。

**Components:** FFmpeg/Whisper 结果变量适配器、工作流节点配置校验、AI capability policy、前端 workflow API/store/page、通知终态事件、Provider 路由与图像 Provider。

**Dependencies:** Phase 1 的稳定运行实例标识和已有 AI 制品状态机。

**Done when:** FFmpeg 产物可被 Whisper 读取；不可用 FFmpeg 后端拒绝启动；复制和模板可在页面完成；终态通知可重试且幂等；LLM 和图像 Provider 的策略边界明确。
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: 多副本一致性和容量边界

**Goal:** 防止定时扫描重复投递，并限制事件、检索和内存使用的放大效应。

**Components:** task-service 任务 claim/CAS、运行事件游标 SQL、SSE/WS 查询窗口、知识检索边界、持久化 Embedding 配置、事件保留任务和连接池/线程池预算。

**Dependencies:** Phase 1/2 的稳定状态和变量契约。

**Done when:** 三副本下同一超时任务只会成功 claim 一次；事件查询不会全量加载尾部数据；Embedding 重启后可恢复；资源边界有配置和超限测试。
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: 部署、灾备和容量证据

**Goal:** 把部署方式、备份恢复和真实性能验证变成可重复的发布门禁。

**Components:** Compose/Swarm/TLS 配置、备份恢复脚本、健康检查、OpenTelemetry/告警配置、JMeter 真实场景和容量证据格式。

**Dependencies:** 前三阶段的正确性和可观测字段。

**Done when:** 初始化密钥、TLS、外部 HA 依赖和运行环境被明确检查；恢复演练能校验数据与对象；真实目标完成阶梯、峰值、浸泡和故障恢复后才允许输出通过结论。
<!-- END_PHASE_4 -->

## Additional Considerations

- 本轮不引入新的消息平台、工作流引擎或数据库类型；当前问题可以用已有 Outbox、CAS、租约和游标修复。
- “代码具备 HA 配置”与“真实 HA 通过验收”始终分开记录。
- 开题报告中的能力依赖外部模型、FFmpeg、Tesseract 和向量服务时，前端必须显示不可用原因，后端必须拒绝未知能力。
