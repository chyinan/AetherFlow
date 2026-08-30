# AetherFlow 企业级投产加固设计

## Summary

在保留现有 Vue 3、Spring Cloud、自研 DAG Runtime、RabbitMQ、Redis、MySQL、MinIO 与 Python AI Runtime 技术栈的前提下，消除工作流状态回退、异步消息丢失、RAG 数据损坏和前端竞态等投产阻断问题。实现按正确性、可靠性、规模化、交互与最终验收六个阶段推进，每个阶段都必须以失败测试开始，并以构建、自动化测试和适用的真实交互验证结束。

## Definition of Done

- 上次企业级审计中的全部 P0、P1、P2 问题均有明确修复、回归测试与可复现验证，不以隐藏错误或降低测试标准替代修复。
- 工作流实例、运行快照、Task 与 AI Job 状态保持单调且可恢复；异步与同步节点输出契约一致；派发、回调、取消和重试具备幂等与过期结果保护。
- RAG 文本不会被清洗损坏，预览与入库一致，检索上下文真正进入 LLM；摄取、检索、计数、CRUD、依赖删除和大数据量路径满足生产边界。
- 前端不存在无确认破坏性操作、旧请求覆盖新状态、离页后强制跳转、错误伪装为空状态或移动端不可操作等已审计问题。
- 不安全的代码执行在具备资源级隔离之前不能在生产开放；所有可见节点配置必须与后端执行契约一致。
- Java、前端、Python 测试与生产构建通过；补充并发、故障注入、契约和 Playwright 回归验证；工作区无临时文件和无关改动。

## Glossary

- **运行快照**：`af_workflow_runtime_snapshot` 中保存的 DAG 状态、变量和节点集合。
- **投影实例**：`af_workflow_instance` 中供查询和 UI 展示的运行状态记录。
- **逻辑尝试**：同一工作流节点因恢复或重试产生的稳定 attempt 标识。
- **过期回调**：taskId/attempt 与当前 WAITING 节点不匹配的结果事件。
- **摄取任务**：文件读取、清洗、切分、Embedding 和索引写入的持久异步操作。
- **Preflight**：保存或运行前对 DAG、节点配置、引用和变量契约的完整验证。

## Architecture

选择渐进式加固而不是替换引擎：Runtime 继续负责 DAG 调度，Task/AI Service 继续使用 RabbitMQ，Redis 继续承担租约和缓存，MySQL 继续保存业务事实。新增复杂度仅用于解决已验证的故障窗口：快照 revision/fencing、稳定派发键、结果事件确认/补偿、摄取任务状态以及前端请求代次。

工作流状态写入遵循“锁内产生新状态并原子持久化，锁外不得回写旧状态”。AI 失败只有在消费重试耗尽后才成为终态。每个 WAITING 节点持久化 taskId、logicalAttempt、deadline 与输出适配类型；回调必须匹配这些字段才能推进 DAG。

RAG 摄取从浏览器同步 JSON 往返迁移到后端基于 fileId 的持久任务；文本规范化和分片成为共享纯逻辑，前端预览与后端以契约测试保持一致。知识库语义检索使用外部向量索引或受控的可分页降级路径，不允许无上限全量加载。

前端异步状态统一使用 requestId/AbortController 和目标实体校验。工作流编辑器统一接管删除、校验、撤销和窄屏布局；不可执行配置不再展示为可用。

## Existing Patterns

- 复用现有 `RuntimeSnapshotRepository`、`RedisWorkflowRuntimeLock`、Task/AI RabbitMQ 消息和 HMAC 内部服务凭证。
- 复用知识库已有 `idempotencyKey`、ready 状态、租户过滤、parent-child 元数据和 Qdrant 适配器。
- 复用 Pinia Store、API client、Vue Router 离开守卫和现有 Vitest/Playwright 测试设施。
- 数据库演进继续使用 `docker/mysql/migrations` 的递增 Flyway 迁移。

## Implementation Phases

<!-- START_PHASE_1 -->
### Phase 1: 正确性止血

**Goal:** 修复可直接造成错误结果、状态回退或数据损坏的问题。

**Components:** Workflow Runtime/AI callback、LLM/RAG 上下文、知识文本规范化、同步/异步输出适配、生产代码执行开关。

**Dependencies:** 现有单元测试框架。

**Done when:** 并发状态、首次失败重试、异步输出、RAG context、连续换行、overlap=0 和代码执行生产安全测试先红后绿。
<!-- END_PHASE_1 -->

<!-- START_PHASE_2 -->
### Phase 2: 异步可靠性闭环

**Goal:** 消除重复派发、过期回调、结果丢失、永久 WAITING、假取消和租约失效双执行。

**Components:** Task DTO/表、快照 revision/fencing、result outbox/confirm、WAITING watchdog、真正取消、启动幂等与背压。

**Dependencies:** Phase 1 的状态契约。

**Done when:** 双回调、崩溃窗口、消息丢失、旧 task 回调、锁续租失败、取消后回调和线程池饱和测试通过。
<!-- END_PHASE_2 -->

<!-- START_PHASE_3 -->
### Phase 3: RAG 生产化

**Goal:** 建立可维护、可扩展且结果真实的知识摄取与检索。

**Components:** 后端摄取任务、文件服务读取、向量索引、原子计数、Provider 降级、文档 CRUD、工作流引用保护、metadata、parent-child token 预算与真实指标。

**Dependencies:** Phase 1 文本与上下文契约、Phase 2 异步可靠性。

**Done when:** 大文档不走浏览器往返，重复导入受控，文档可删/重建，删除依赖受保护，语义检索不全量扫 JVM，降级与指标语义有集成测试。
<!-- END_PHASE_3 -->

<!-- START_PHASE_4 -->
### Phase 4: 工作流语义与预检

**Goal:** 让可保存、可运行、可视化的图语义一致且确定。

**Components:** Node validator/preflight、分支边身份、并行变量命名空间、孤立节点策略、条件多前驱语义、LLM/Agent/Code 节点真实能力。

**Dependencies:** Phase 1-3 的后端契约。

**Done when:** 无效节点配置在运行前定位；分支重连、并行冲突、多 root/orphan 和 RAG 引用均有确定行为与契约测试。
<!-- END_PHASE_4 -->

<!-- START_PHASE_5 -->
### Phase 5: 前端并发与体验

**Goal:** 消除破坏性快捷键、请求乱序、离页副作用、错误伪装和不可操作布局。

**Components:** WorkflowCanvas/WorkflowPage、runStore、difyStore/KnowledgePage、服务端分页、向导 dirty guard、移动端画布、键盘 dialog 与可访问性。

**Dependencies:** Phase 3-4 API 契约。

**Done when:** Backspace、A/B 快速切换、离页慢响应、RAG 切库、局部错误、移动端、键盘焦点和新增文件目标库均通过组件或 Playwright 测试。
<!-- END_PHASE_5 -->

<!-- START_PHASE_6 -->
### Phase 6: 生产式验收

**Goal:** 用真实依赖、并发和故障注入证明系统可投产。

**Components:** Docker Compose、MySQL/Redis/RabbitMQ/MinIO/Nacos/Qdrant、JMeter、Jaeger、跨服务 E2E 和文档。

**Dependencies:** 所有前置阶段。

**Done when:** 全量测试、生产构建、Compose 健康、真实 RAG/工作流链路、并发与故障恢复、压力测试和可观测链路均有保存的结果证据。
<!-- END_PHASE_6 -->

## 当前生产边界

- 知识库 fileId 导入已通过持久摄取作业异步完成，支持重试、失败状态和服务重启恢复；带正文的同步 API 仅保留兼容用途。向量兼容字段仍保存在 MySQL JSON 中，语义检索已改为全量数据库分页扫描加有界 Top-K；超大规模生产仍建议切换到 Qdrant/pgvector 等专用向量索引。
- Code 节点默认关闭；Python 运行器已增加 API key、进程组回收、CPU/内存/文件大小限制，但不等同于多租户安全沙箱。只有接入独立容器或 microVM 隔离后才应对不受信任用户开放。

## Additional Considerations

- 不在 Phase 1 引入 Kafka、替换 DAG 引擎或重写前端；这些不会直接修复已确认的问题。
- 所有 schema 变化必须提供增量迁移并兼容已有数据卷。
- 所有破坏性动作必须在 UI、API 和业务层分别校验；所有异步结果必须可辨识目标实体、请求代次和逻辑尝试。
- 任何暂时关闭的功能必须在目录、UI 和 API 中明确显示不可用，不能保留无效可点击配置。
