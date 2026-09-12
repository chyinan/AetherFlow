# AetherFlow 运行时与任务调度审计

审计日期：2026-09-12。对象为当前工作区实际源码（含用户已有未提交改动），参照 `summary/thesis-promises-2026-09-12.txt` 中 P049、P063–P064、P070、P078、P084、P086。只读审计，没有修改业务源码、原测试、配置或部署；另外建立了独立 Java 复现夹具。

结论：这些模块有大量真实实现，不是空壳；但当前正常前端启动链路存在阻断缺陷，恢复和事件续传也存在可复现错误。不能因为有 Outbox、Redis 锁、MQ 和通过单元测试，就认定达到企业级稳定性与功能完整性。

## 已复现的缺陷

### R1 / P1：正常 UI 首次启动工作流会遗漏启动 Outbox，永久 PENDING

- **触发**：首次使用新的 `idempotencyKey` 启动。前端 `frontend/src/pages/workflows/WorkflowPage.vue:419` 正常传递该 key。
- **根因**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:226` 调用 `insertIdempotent` 后，第 227–229 行通过主键读取并立即返回；真实数据库会读到刚插入的新行，因此第 233–234 行创建 Outbox/提交后派发没有执行。
- **数据库依据**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowInstanceMapper.java:27` 的 INSERT ... ON DUPLICATE KEY UPDATE 使用 `useGeneratedKeys`（第 36 行）。新插入和冲突复用均可获得记录主键，不能用“按主键查到记录”区分二者。
- **影响**：实例写入成功、接口成功，但没有可扫描的启动 Outbox，也没有运行快照；定时启动恢复只扫描 Outbox，运行恢复只扫描 RUNNING/RETRYING 快照，因此不能自愈。直接违反启动必须在同一事务写实例和唯一 Outbox 的项目契约。
- **复现**：`summary/audit-runtime-repro/AuditRuntimeRepro.java` 使用实际 `WorkflowServiceImpl`、原测试夹具和 Mockito Mapper，模拟真实数据库插入回填主键及随后可读。无 key 对照产生 1 条 Outbox，新 key 产生 0 条 Outbox、0 次 runtime 调用。输出见 `summary/audit-runtime-repro/result.txt`。
- **测试为什么漏掉**：`WorkflowServiceImplTest.java:116` 正常启动用例调用 `request()`，第 599–603 行 helper 不设置 key；第 252–271 行只测试 key 已存在时早返回，没有首次使用新 key 的插入路径。
- **修复验收**：真实 MySQL 首次 key 请求必须有且只有一个实例、一个 Outbox；并发相同 key 返回同一实例且只执行一次；提交成功但 HTTP 响应丢失后重试仍可正常运行。

### R2 / P1：恢复扫描使用加锁前的旧快照，正常并发也会重复执行已完成节点

- **触发序列**：恢复扫描先批量读取某流程的旧 RUNNING 快照；原运行器随后完成节点 A、把 B 保存为 WAITING 并释放租约；扫描器之后处理这条旧记录并成功拿锁。
- **根因**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java:68` 先读取整批，第 72 行逐个恢复；第 83–94 行把扫描得到的旧数据传入引擎。`backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java:204` 加锁后，`resumeLocked` 第 209–218 行直接使用旧 `recoverySnapshot` 建上下文、Tracker 并保存，没有锁内重新读最新快照。`WorkflowRuntimeSnapshotMapper.java:36–43` 对 WAITING 行仍允许重新 claim token，因此正常租约互斥不能阻止这个状态回退。
- **影响**：丢失最新节点输出、重复执行已经落库的节点；同步 HTTP/外部节点可能重复产生业务副作用。AI 任务自身的稳定幂等 key 能保护部分 AI 重放，但不能保护全部节点及整个 DAG 状态。
- **复现**：独立夹具令 repository 的最新快照为 WAITING，A 已完成；传入扫描时旧 RUNNING 快照，实际 engine.resume 再执行 A 一次且 `findByWorkflowId` 调用次数为 0。输出为 `latest durable snapshot=WAITING with done completed; resume(stale RUNNING) re-executes done, fresh snapshot reads=0`。
- **测试缺口**：`WorkflowRuntimeRecoveryTest.java:23` 只验证单份输入快照中的已完成节点会跳过；没有“扫描后、获取锁前，数据库快照变新”的竞争用例。异步完成路径已有锁内读取，不能据此推断 resume 路径也安全。
- **修复验收**：获得当前租约并完成数据库所有权接管后重读最新快照，核对是否仍需恢复；双副本实测扫描/WAITING/回调交错，不重复执行已完成节点。

### R3 / P1：超过 500 条事件后，SSE 与 WebSocket 都卡在第 500 条

- **触发**：一次工作流产生 501 条及以上事件，客户端从头订阅并读至第 500 条。宽 DAG、循环/迭代、重试均可能达到此规模。
- **根因**：`backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java:229` 每次缓存刷新都取最早 500 条；第 118–120 行发现 cursor 在缓存末尾后直接返回空列表，不再执行第 123 行增量查询。缓存过期后仍是相同前 500 条。
- **数据库依据**：`MybatisRuntimeEventStore.java:57–61` 确实按 occurredAt/id 升序、LIMIT 500 取最早页。`RuntimeEventWebSocketHandler.java:112` 与 SSE 共用此方法。
- **影响**：500 以后的进度、失败、完成事件无法送达；客户端携带 cursor 重连依然停滞。“无需刷新、持续展示完成和异常”的承诺在合法长流程上失效。
- **复现**：独立夹具提供 501 条持久事件，第 501 条为终态，第一次获得 500 条，随后 cursor=event-500 返回 0 条且增量查询调用为 0；结果文件已记录。
- **测试缺口**：`RuntimeEventStreamServiceTest.java:79` 的增量分页测试只模拟 cursor 不在缓存内；第 97 行缓存测试使用小列表，没有正好在 500 条页尾的用例。
- **修复验收**：测试 499/500/501/1001 条事件，跨页后终态到达、SSE 与 WebSocket 重连续传不遗漏、不重复。

## 静态代码已明确的可靠性缺陷

### R4 / P1：启动时没有固定工作流定义，排队后可能执行另一版本或无限重试

- **触发**：已提交启动请求因进程重启、执行池满或派发滞后还没生成快照，此时用户编辑或删除工作流定义。
- **依据**：`WorkflowServiceImpl.java:212–222` 实例只存 definitionId、inputJson，没有定义版本/定义 JSON；`WorkflowStartOutbox` 同样不保存执行定义。派发 `WorkflowServiceImpl.java:319–326` 重新读取当前 definition JSON 构建运行请求，没有重新执行第 208–209 行的启动预检。定义软删除则第 402–406 行抛异常，第 333–339 行固定 5 秒重试，未设终止策略。
- **影响**：本次运行与用户提交和预检通过的版本不一致；修改为依赖未启用 Provider 的流程也不会在真正派发处重新做相同预检；删除则已成功提交的运行长时间 PENDING、Outbox 持续重试。
- **现有实现的边界**：运行器启动成功生成快照后，快照确实保存定义 JSON；缺口在提交启动到首份快照这一段，不应把所有恢复都描述为读取现行定义。
- **测试缺口**：现有启动 Outbox 测试注入固定 definition；未覆盖排队期间编辑/删除或恢复后定义变更。
- **修复验收**：实例创建事务固定不可变定义版本/完整运行请求，后续派发和恢复使用该版本；定义删除不破坏已接收运行。

### R5 / P1：随机 token 的数据库 claim 可被过期 Redis owner 反向覆盖

- **触发序列**：A 已在 Redis 获取租约后暂停超过 TTL，尚未执行 SQL claim；B 重新获取 Redis 租约并把 snapshot token 写为 B、开始运行；A 恢复，继续执行自己延迟的 SQL claim，把 token 改回 A。
- **代码依据**：`RedisWorkflowRuntimeLock.java:42–47` 是 UUID + Redis SET NX TTL；`WorkflowRuntimeEngine.java:257–268` acquire 后调用 `snapshotRepository.claimForLease`，然后才开始续约；`WorkflowRuntimeSnapshotMapper.java:36–43` 的 claim 只按 workflowId/非终态更新，无旧 token、租期或单调 epoch 条件。`ensureLockHealthy` 第 602–606 行只看本地 boolean，新续约任务首次执行前仍为 false；`updateIfOwned` 第 71–73 行仅判断等于当前 token，所以 A 反向 claim 后可写。
- **影响**：在 GC 暂停、CPU 饥饿、跨系统请求延迟场景下，已经过期的 owner 可以重新成为数据库“所有者”，运行器可能重复执行节点/覆盖快照，合法 B 写入被拒。
- **与已有保护的区别**：已实现的 token 比较能阻止“旧 A 直接 save，而 B 已改过 token”；但不能阻止“旧 A 的 claim 操作延迟到 B 之后”，后者会重新获得 SQL 写权。AI Job 的数据库租约则在同一数据库检查 lease_expires_at，不能把其较强保证套用到 Workflow Redis+DB 跨系统锁。
- **测试缺口**：`MybatisRuntimeSnapshotRepositoryTest.java:79` 验证 token 不等时 save 拒绝，没有旧 owner 迟到 claim；锁单测覆盖已持锁拒绝、续约失败等，没有上述双副本 acquire/claim 交错。本项为严格代码交错推导，未执行真实 Redis+MySQL 故障注入。
- **修复验收**：使用数据库权威租约或单调 fencing epoch 等可拒绝迟到 claim 的机制，压测中加入暂停 owner 超过 TTL 后恢复，并核对节点副作用与快照状态。

### R6 / P2：取消不是在途工作终止，且传播到 task-service 失败后没有持久补偿

- **依据**：`WorkflowRuntimeEngine.java:659–679` 只在等待下一完成结果前检查取消；第 999 行 `completionService.take().get()` 没有截止时间/取消唤醒，没有保存 Future 并在取消/兄弟节点失败时终止在途执行。`submitReadyNodes` 第 716–739 行以及 `executeNode` 第 750–762 行没有执行前的持久取消探测。`WorkflowRuntimeController.java:268–275` 取消 task-service 调用失败仅写日志，没有 Outbox/重试。
- **触发**：用户在同步节点、模型请求或媒体处理正在运行时取消；或取消时 task-service 暂时不可达。工作流被标 CANCELLED，但已派发任务仍可能继续消耗 CPU/GPU/外部费用；极端在途挂死可长期占住共享节点线程和运行租约。父节点完成与取消交错时，也存在协调线程观察取消前提交子节点的窗口。
- **边界**：晚到结果已有工作流取消状态防回写，AI worker 执行前也查 task-service CANCELLED；因此不能说取消完全没做，也不能说一定会把工作流改回成功。但资源释放、下游任务可靠停止与故障补偿仍未闭环。
- **测试验收**：真实长任务执行中取消、取消传播网络失败再恢复、某个并行节点失败时兄弟任务停止；验证任务不继续收费/不继续产生外部副作用，线程/队列资源可回收。

## 按文档承诺核验

| 文档承诺 | 当前代码实际实现 | 评价与边界 |
|---|---|---|
| P048 创建/编辑/保存/复制/删除/模板 | WorkflowServiceImpl 中有服务方法，定义保存含版本 CAS；服务端 DAG/节点目录校验 | 后端不是占位；启动主链路受 R1 阻断，定义生命周期受 R4 影响 |
| P049 DAG 无环、依赖推进、记录节点状态 | WorkflowDag 拓扑结构、引擎并行 ready 队列、分支跳过、快照存储、RuntimeEvent | 已实现；运行恢复 R2/R5、事件 R3 阻碍“完整稳定” |
| P063 长任务异步提交 | AsyncAiTaskDispatcher 发往 task-service；Task 持久记录；RabbitMQ dispatch→worker；WAITING 节点由结果消费恢复 | 已有真实跨服务链路，不是仅线程池异步 |
| P064 等待/运行/成功/失败/重试与超时 | TaskStateService 第 34–52 行用 DB CAS；TimeoutChecker/RetryManager 扫描；AI 数据库租约+心跳；WAITING watchdog 默认 30 分钟 | 具备实现，但不同状态系统没有完全统一；同步节点没有统一运行截止时间，取消见 R6 |
| P064 崩溃后可持续推进（企业目标） | 启动 Outbox、运行快照、定期恢复、终态投影/通知补偿 | 结构已经存在，R1/R2/R4/R5 是实际保证缺口 |
| P070 实时节点状态与无需刷新 | RuntimeEvent 持久表、SSE 主链路、WebSocket 备用、Last-Event-ID/cursor | 真实实现；超过 500 条失败见 R3；这些是生命周期事件，不能据此把所有应用日志都算作已实时推送 |
| P070 任务完成/异常通知 | WorkflowTerminalNotificationOutboxService 固定 eventId、唯一键去重、扫描抢占、重试；终态 reconciliation 补写 | 真实实现；工作流初始主路径失败、错误状态/事件问题会影响上层结果 |
| P078/P086 高并发、队列、服务保护压力验证 | 引擎/外层线程池有上限，Task 有队列背压，Prometheus 相关源码；这些是容量保护手段 | 静态代码与单测不构成已具备“大并发/极强稳定性”的实证，仍需真实端到端持续负载与上述故障交错验证 |

## 独立验证方式与证据边界

执行：`rtk proxy python -X utf8 summary/audit-runtime-repro/run.py`，本次退出码 0。

脚本从已有 Surefire 报告读取 JDK/classpath，独立 javac/java 编译执行到审查目录，未调用 Maven、未连接真实数据库、未启动服务、未发起压测。三个缺陷的夹具均调用实际业务类，只对外部依赖建立可控状态，用于证明具体逻辑分支。数据库幂等插入返回规则、事件分页查询顺序、恢复 claim 条件再由实际 Mapper SQL交叉证明。

完整 Maven 回归由根审计任务负责。不能将这些轻量夹具通过写成“真实生产环境故障演练通过”。
