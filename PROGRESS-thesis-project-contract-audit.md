# 进度追踪：开题报告与 AetherFlow 项目功能契约审查

> 创建时间：2026-08-31 | 状态：进行中

## 目标
审查开题报告中的功能承诺，与 AetherFlow 项目实际完成情况逐项对照，并从企业级高并发、稳定性、可靠性、可用性和生产运维角度评估风险。

## 成功标准
明确标出已实现、部分实现、未实现或无法验证的功能；提供对应的源码、配置、测试或验证脚本证据；指出与企业级产品要求不匹配的并发、稳定性、数据一致性、安全和运维风险。

## 已读文件
- `C:\Users\chyinan\Downloads\陈胤安 广州工商学院本科毕业论文（设计）开题报告  (1).docx` — 从 OOXML 提取出 136 个段落，冻结了认证、工作流、八类节点、任务调度、文件统一管理、实时通知、Provider 容错、容器部署和压力测试等承诺。
- `summary/report-function-commitments.md` — 已有功能承诺清单及“真实实现才算完成”的判定口径。
- `summary/enterprise-report-commitments.md` — 已有逐页企业级审计基线和“存在/可用/生产可用/已验证”四级口径。
- `summary/enterprise-consistency-audit-report.md` — 已有审计线索，待用当前源码和命令重新核验。
- `AGENTS.md` — 项目产品契约、投产验证命令和事件流约束。
- `pom.xml` — Java 多模块聚合结构和 Spring Cloud 依赖入口。
- `frontend/package.json` — 前端测试与构建入口（待进一步读取）。
- `docker-compose.yml` — 单机基础设施与业务服务编排入口（待逐项读取）。
- `Architect.md` — 服务边界、数据流和前端/后端架构说明（待逐项读取）。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java` — 工作流 CRUD、启动、复制、模板和启动 Outbox 逻辑。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowStartOutboxMapper.java` — 启动 Outbox 的 claim/dispatch/retry SQL。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowStartRecoveryJob.java` — 每 5 秒扫描待派发工作流。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/preflight/WorkflowAiCapabilityPolicy.java` — AI 能力服务端预检规则，确认漏掉 FFMPEG。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/FfmpegWorkflowNodeExecutor.java` — FFmpeg 工作流节点真实调用路径。
- `backend/ai-service/src/main/java/com/aetherflow/ai/workflow/executor/FfmpegNodeExecutor.java` — AI 侧 FFmpeg 转换和 MEDIA 制品输出。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/AiWorkflowNodeResultAdapter.java` — 异步结果到工作流变量的映射，确认 FFMPEG 无派生变量。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java` — ready 数据检索、语义分页扫描、元数据过滤和知识摄取。
- `backend/task-service/src/main/java/com/aetherflow/task/service/TaskStateService.java` — 任务状态更新无 CAS；与多副本超时/重试扫描交叉核验。
- `backend/notify-service/src/main/java/com/aetherflow/notify/service/impl/NotificationServiceImpl.java` — 通知持久化、幂等和 Redis fanout。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java` — SSE 轮询、心跳、游标和事件服务层截断。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/event/MybatisRuntimeEventStore.java` — 运行事件全量/增量 SQL，确认未在数据库侧限制返回量。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/store/InMemoryVectorStore.java` — Embedding 默认内存存储和重启丢失边界。
- `backend/workflow-service/src/main/java/com/aetherflow/workflow/embedding/config/EmbeddingProperties.java` — Embedding 默认 provider/store 配置。
- `frontend/src/api/modules/workflow.ts` — 复制/模板 API 仅有前端模块导出。
- `frontend/src/pages/workflows/WorkflowPage.vue` — 工作流页面实际调用路径，未发现复制/模板调用。
- `frontend/src/api/mappers/workflowMapper.ts` — FFMPEG 前端节点映射及输出声明。
- `frontend/src/config/runtimeEnv.ts` — 前端正式环境 Mock fallback 默认关闭。
- `python-ai-service/app/main.py` — FFmpeg/Whisper/LLM API、输入下载上限和并发闸门。
- `docker-stack.yml` — Swarm 多副本拓扑，状态依赖外置 HA 集群。
- `docs/production-ha-runbook.md` — 生产 HA、灾备、容量门禁的前置条件。
- `scripts/aetherflow-run-performance.ps1` — 默认 10 线程/20 秒/3 循环的轻量真实基线。
- `scripts/aetherflow-capacity-gate.ps1` — 真实容量门禁参数；SoakMinutes 仅写入证据说明，不执行浸泡。
- `performance-test/README.md` — JMeter 基线明确不依赖真实 AI/GPU/Whisper/LLM。

## 当前进度
代码、前端、部署和验证证据调查已完成，正在进行最终一致性判定与企业级投产结论整理

## 下一步
输出带 P0/P1/P2、已实现/部分实现/未证明判定和验证边界的审查结论

## 发现的关键信息
- 最新 HEAD 已补齐旧审计中的工作流复制、预设模板、账号资料维护、独立 FFmpeg 节点和 AI 制品租约，旧摘要不能直接作为当前结论。
- P0：`startInstance()` 写入 `PENDING` 启动 Outbox 后直接执行；`executeRuntime()` 的 `markDispatched()` 只更新 `DISPATCHING`，所以正常执行无法终结 Outbox。每 5 秒扫描会再次执行，且不跳过 SUCCESS。
- P1：服务端 AI 能力预检评估了 FFMPEG 可用性，但 `WorkflowAiCapabilityPolicy.requiredCapability()` 没有把 FFMPEG 纳入校验。
- P1：FFmpeg 生成的 MEDIA artifact 经过存储后没有映射为下游可用的 `fileUrl`/`fileId` 工作流变量，文档所述 FFmpeg→Whisper 组合闭环不成立。
- P1：task-service 多副本定时超时/重试扫描没有 claim/CAS，`TaskStateService.mark()` 直接 `updateById`，存在重复投递风险。
- P1：语义检索的正确性已按分页全量扫描处理，但 MySQL LONGTEXT 向量 + JVM 余弦计算不具备大规模检索性能基础。
- 未证明：Python 测试依赖缺失、Compose 未用初始化密钥展开、无真实 AI/长媒体/峰值/浸泡/故障恢复容量报告。

## 验证结果
- `mvn test` — BUILD SUCCESS。
- `frontend/npm test` — 46 个测试文件、165 项测试通过。
- `frontend/npm run build` — 生产构建通过。
- `aetherflow-performance-gate-self-test.ps1` — 正反例通过。
- `aetherflow-performance-contract-test.ps1` — Mock Gateway，1 线程、11 样本、0 错误通过。
- `aetherflow-verify-deployment.ps1 -ConfigOnly` — 因缺少 `AI_INTERNAL_TOKEN` fail-closed，未完成真实部署验收。
- Python API 测试 — 当前依赖环境缺少 `fastapi`/`pytest`，未执行成功。
