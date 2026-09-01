# AetherFlow 开题报告与企业级一致性审计摘要（2026-09-01）

## 审计口径

- 开题报告使用当前下载文件重新提取并由 LibreOffice 渲染为 16 页逐页查看。
- 项目以当前工作树为准；旧 summary 只作为线索，不作为结论证据。
- 判定分为：已实现、部分实现、未实现/未闭环、已实现但未证明投产。

## 当前结构

- Java Maven 多模块：common、workflow-runtime-api、gateway、auth、workflow、task、ai、file、notify。
- 前端：Vue 3 + TypeScript + Vue Flow + Pinia，工作流定义已接真实后端。
- AI：ai-service 通过 RabbitMQ 异步执行，Python AI Service 提供 Whisper/FFmpeg/LLM/字幕运行时。
- 数据/基础设施：MySQL、Redis、RabbitMQ、MinIO、Nacos、Seata、Prometheus/Grafana、Jaeger。
- 工作流：自研 DAG Runtime，持久快照、Redis 工作流锁、SSE/WS 游标、启动 Outbox、AI 终态 Outbox。

## 已核验为存在的功能

- 账号注册、密码登录、刷新/登出、Google/GitHub OAuth、当前用户资料和密码更新、Gateway JWT 鉴权。
- 工作流 CRUD、整个定义复制、两个预设模板、ComfyUI 导入、Vue Flow 编排、DAG 循环/连线/节点目录校验。
- 独立 FFMPEG、WHISPER、LLM/SUMMARY/TRANSLATE、OCR、EMBEDDING、KNOWLEDGE_RETRIEVAL、IMAGE_GENERATION/UPSCALE/SAVE_IMAGE、EXPORT/END 节点。
- 文件上传/分片/查询/下载/删除，AI 生成 artifact 的 MinIO + 元数据 + 幂等/租约/批量提交状态机。
- 用户级核心数据过滤；知识库 ready 数据集/文档/分片、父子分片、Qdrant 搜索和 metadataFilter。

## 当前已核验缺口/风险

1. 前端生产契约检查失败：`frontend/scripts/check-workflow-node-backend-mapping.mjs` 仍断言 `ffmpeg -> UPLOAD`，而当前 mapper 已使用 `FFMPEG`。
2. 工作流 AI 结果队列只由 Workflow Service 启动时声明，未预置在 `docker/rabbitmq/definitions.json`；Workflow Service 不可用/启动竞态期间，AI Outbox 可能被确认发布但没有 workflow result queue 接收，工作流随后只能等待超时。
3. 快照恢复只在 `ApplicationRunner` 启动时执行，没有持续恢复扫描；滚动发布时若新副本因 Redis runtime lock 忙而跳过恢复，旧副本随后故障可能无人接管。
4. `MybatisRuntimeSnapshotRepository` 只有 JVM 进程内 64 槽保存锁，跨副本没有快照版本/CAS/fencing；锁丢失后的旧执行者可能覆盖新执行者的快照。
5. `WorkflowInstanceQueryServiceImpl` 每个运行列表项加载该实例全部运行事件，随后才截取日志尾部；MyBatis 事件查询默认最多 10000 条，列表页可放大为大量数据库读取和内存对象。
6. 运行事件虽然有唯一 eventId 和保留任务，但 `select then insert/update` 在跨副本重复 append 时不是数据库原子幂等写。
7. 生成图片/同步 Export 使用 `ImageArtifactStorage`/`createMetadata` 路径，未复用 AI artifact 的 job lease/batch/idempotency 状态机；进程在 MinIO 写成功、元数据写入前崩溃或回调重复时可产生孤儿/重复对象。
8. Whisper 的时间信息以 SRT artifact 形式返回，工作流变量适配器只映射 `srtObjectKey`，未把 `srtFileId`/`srtUrl` 作为稳定变量映射；END 输出节点本身只整理变量，不直接生成可下载文件，需额外 EXPORT 节点。
9. 配置目录校验主要是字段类型/必填/枚举，不验证跨字段“文件 URL/ID、LLM prompt、Embedding/Qdrant 等输入是否可执行”；Embedding/OCR/knowledge retrieval 不完全纳入 AI 能力预检，可能保存成功、启动后才失败。
10. 图像 Provider 有健康探测和可用 Provider 顺序，但没有复用用户级 LLM Provider 路由策略，也没有和 LLM 一样的故障切换事件审计。
11. Notify WebSocket 会话只有 token/origin 校验，没有连接数上限、发送队列上限或心跳治理；通知 SSE 有 10000 连接上限，但 Redis Pub/Sub 仍是非持久实时通道，历史补偿依赖客户端重连。
12. 通知内部发送接口路径为 `/notify/internal/send`，被 Gateway `/notify/**` 路由覆盖；虽有内部 token，但违反“internal 不经 Gateway”的边界约定。
13. 核心表按 `user_id/owner_user_id` 隔离，未建立一等 `tenant_id`/组织权限模型；workspace member 与工作流/文件/知识库授权尚未形成统一租户 ACL。Notify 节点还允许配置任意目标 `userId`。
14. 工作流定义创建、更新和启动没有操作级 idempotency key；客户端超时重试可能重复创建定义或运行实例。
15. 真实性能证据仍不足：JMeter 契约测试只跑确定性 Mock Gateway 11 样本；仓库性能旅程的工作流是 `START -> TEMPLATE_TRANSFORM -> END`，不执行真实 AI/媒体/队列消费。当前 Docker daemon 不可连接，无法做真实部署健康、故障注入、容量和浸泡测试。
16. Compose 默认是 MySQL/Redis/RabbitMQ/MinIO/Nacos/Seata 单实例；HA 覆盖层只把无状态业务服务设为双副本，Nginx 仍单实例，状态组件依赖外部 HA。默认 Gateway 还映射宿主机 8080，可绕过 Nginx 的 TLS/限流入口。

## 新鲜验证

- `mvn test`：10 个 Maven 模块，汇总 705 项测试通过。
- `frontend/npm test`：46 个测试文件，166 项通过。
- `frontend/npm run build`：通过。
- Python：`python-ai-service` 21 项、`ai-runtime` 4 项通过。
- 前端 `check:*`：13 项通过，`check:workflow-mapping` 失败。
- 性能契约：Mock Gateway 11 个样本，0 错误；门禁 self-test 通过。
- Compose config-only：使用临时强密钥环境通过，展开 25 个服务；真实 Docker daemon 检查失败。
