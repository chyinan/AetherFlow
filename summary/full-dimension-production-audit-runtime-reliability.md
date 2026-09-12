# AetherFlow 运行可靠性审计摘要

> 核验日期：2026-09-01  
> 状态：阶段性结论，待新鲜测试与数据库契约复核。

## 已确认的加固能力

- 工作流启动先在本地事务写 `PENDING` 实例和唯一 Outbox，事务提交后才扫描并抢占，避免 HTTP 事务与恢复扫描双重派发。
- 启动 Outbox 使用 `DISPATCHING + lease_token + heartbeat`，运行时使用 Redis 锁续租和数据库 `fencing_token` 保存快照。
- 运行时恢复既在启动时执行，也有 10 秒持续扫描；旧审计“只启动恢复一次”已过时。
- 运行事件通过 `INSERT ... ON DUPLICATE KEY` 原子幂等写入，并有 30 天保留任务。
- Task Service 状态迁移已使用数据库 CAS，旧审计“多副本扫描无 CAS”已过时。
- AI Job 使用数据库租约、心跳、attempt、用户范围幂等键和带租约的终态迁移；Rabbit listener 并发区间配置已经生效。

## 高风险缺陷

### RUNTIME-01：Task 最大重试次数不会可靠持久化

- `RetryManager.scheduleRetryOrDeadLetter()` 对 `task.setRetryCount(nextRetryCount)` 只修改当前 JVM 对象。
- `TaskStateService.mark()` 最终调用 `TaskMapper.updateStatusIfCurrent()`，SQL 仅写 `status/next_retry_at/updated_at`，不写 `retry_count`。
- 下一轮定时扫描重新从 MySQL 加载任务后，`retry_count` 仍是旧值，持续失败可能永远达不到 `maxRetries`，形成无限重试与消息/外部调用放大。

判定：P0 候选，需用回归测试确认当前数据库行为。

### RUNTIME-02：终态快照对账会被历史记录饿死

- `findTerminal(limit)` 按 `updated_at ASC LIMIT n` 固定返回最早终态快照。
- `reconcileTerminalWorkflows()` 只尝试更新实例，不删除快照、不记录已对账标记，也不让已对账行退出后续查询。
- 终态快照超过 `scanLimit` 后，扫描器会不断读取同一批旧行；较新的“快照已终态、实例未终态”记录可能永远进不了扫描窗口。

判定：P1。

### RUNTIME-03：终态通知 Outbox 与实例终态不具备原子/补偿闭环

- 正常运行先更新实例终态，再单独插入通知 Outbox，中间存在进程崩溃窗口。
- `reconcileTerminalWorkflows()` 补实例终态时不补建通知 Outbox。
- 用户取消接口直接把实例和快照标为 `CANCELLED`，不创建终态通知 Outbox；后续运行投影因实例已终态通常不会再触发 enqueue。

判定：P1，违反项目“工作流终态通知必须具备幂等、抢占、重试和保留”的完整语义。

### RUNTIME-04：AI 任务事件 Outbox 的抢占没有所有权 fencing

- `claimForPublishing()` 仅把行设为 `PROCESSING`，没有 claim token/owner。
- 处理超过固定 2 分钟后另一副本可接管；旧发布者随后仍使用无条件 `updateById` 标记 `PUBLISHED` 或在失败时改回 `PENDING`。
- 慢旧副本可能覆盖新副本的状态，造成重复回调、重复制品提交或重试风暴；下游幂等只能减轻副作用，不能修复 Outbox 自身状态机。

判定：P1。

## 中低风险与容量问题

- 启动 Outbox 把 `DISPATCHED` 也作为 30 分钟后可重新抢占状态，已成功的记录会永久周期性扫描和确认；未看到该 Outbox 的保留/归档任务。
- 启动 Outbox 失联恢复阈值硬编码为 30 分钟，而实际心跳为 10 秒，故障恢复时间不可通过配置/SLO 管理。
- 运行快照未发现保留或归档任务；终态快照无限增长会放大 `RUNTIME-02`。
- 运行事件保留每小时最多删除 1000 条；若到期事件产生速率长期高于 1000/小时，过期积压会持续增长。
- Runtime SSE 每个连接每秒轮询，虽然同一工作流有 1 秒缓存，但没有显式连接数上限；大量不同工作流连接会放大 MySQL 查询与调度队列。
- 用户取消仅持久化取消并通知 Task Service；已经进入模型/FFmpeg 的外部调用没有强制中断，只能依靠晚到结果 fencing，成本和资源仍会继续消耗。

## 当前结论

可靠性架构已明显超过演示级项目，但“有 Outbox/租约/扫描器”不等于状态机闭环正确。当前至少存在一个可能造成无限重试的正确性缺陷，以及终态恢复、通知和 AI Outbox 所有权的跨副本缺口。
