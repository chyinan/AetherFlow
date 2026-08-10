# AetherFlow 深层使用闭环审计进度

> 审计日期：2026-08-10～2026-08-11
> 当前分支：`graduation/chyinan-maintenance`
> 审计基线：`8412425 fix: finish maintenance hardening`
> 状态：审计项已逐项修复，全量复验已完成，下一步提交维护成果

## 1. 审计范围与结论

本轮审计阶段采用只读方式定位问题，随后按审计结论完成了产品代码和回归测试修复，也没有改变前端视觉风格。重点检查了前后端 API 链路、工作流节点目录与回读映射、运行时状态恢复、审批状态、文件与知识库闭环、登录态隔离、通知实时连接、内部鉴权和多实例部署行为。

审计基线共确认：

- 22 个会直接影响实际使用、数据一致性、权限或可靠性的缺陷，其中包含 1 个前端工作流节点回读映射遗漏：`NOTIFY`；当前维护改动已全部覆盖。
- 2 类明确标注但尚未完成的产品能力：真实代码执行、迭代/循环子图执行；当前维护改动已分别接入隔离 Python runtime 和受限嵌套 body 执行。

其中，审批拒绝语义、公开文件 URL、任务权限校验、SSE token 续期和 URL 抓取路由应优先处理。它们会造成错误执行、越权读取、功能中断或页面看似可用但请求实际失败。

证据中的行号以本次审计时的代码为准。本文件第 2、3 节保留原始审计证据，不代表当前仍未修复的问题。

## 2. 审计发现（已逐项修复）

### P0/P1：功能链路、状态和权限

1. **URL 抓取前端请求没有对应 Gateway 路由。**

   证据：`frontend/src/services/api/settingsApi.ts:394` 请求 `/ingestion/url/fetch`；`backend/gateway-service/src/main/resources/application.yml:100-126` 没有 `/ingestion/**` 路由；实现实际位于 `backend/workflow-service/.../UrlIngestionController.java`。

   影响/复现：从前端发起 URL 抓取时，请求无法按预期转发到 workflow-service，表现为 404 或网关路由失败。直接在设置页执行 URL 导入即可复现。

2. **项目关联依赖 localStorage 和名称启发式，没有贯穿真实 `projectId`。**

   证据：`frontend/src/stores/projectStore.ts:58-67`；`backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/ProjectWorkspaceServiceImpl.java:310-330`。

   影响/复现：同名项目、刷新页面、切换项目或后端数据变化后，文件、工作流和运行记录可能被归到错误项目；项目摘要还固定返回空工作流列表。新建两个相近名称的项目后刷新并查看工作区即可触发。

3. **项目统计不是实时聚合，而是数据库静态字段或客户端提交值。**

   证据：`ProjectWorkspaceServiceImpl.java:69-87,127-170`。

   影响/复现：新增/删除工作流、运行、文件或知识库后，项目卡片中的数量可能长期不变或与真实数据不一致。只要通过其他入口创建或删除资源，再返回项目页即可观察。

4. **文件“标记为输入/产物”只写入 Pinia 内存。**

   证据：`frontend/src/stores/fileStore.ts:129-140`。

   影响/复现：刷新页面、重新登录或重新加载文件列表后标记丢失；后端没有持久化的对应更新接口。标记文件后刷新页面即可复现。

5. **刷新文件列表只追加数据，不移除后端已经删除的文件。**

   证据：`frontend/src/stores/fileStore.ts:30-33`。

   影响/复现：文件在别的页面或用户操作中删除后，当前文件页刷新仍可能保留旧项，形成“幽灵文件”。先删除文件，再触发当前列表刷新即可复现。

6. **上传文件的工作流关联被硬编码为 `wf-media-digest / Media Digest Pipeline`。**

   证据：`frontend/src/api/mappers/fileMapper.ts:52-76`。

   影响/复现：用户从其他工作流或项目上传文件时，列表显示的关联工作流和名称仍是固定值，后续筛选、统计和项目归属会失真。

7. **任务查询接口缺少用户/工作流所有权校验。**

   证据：`backend/task-service/.../TaskController.java:22-25` 的 `/tasks/{id}` 查询没有按当前用户校验；这与 workflow runtime controller 已有的 `assertWorkflowOwner` 形成不一致。

   影响/复现：已登录用户若能猜到其他任务 ID，可能读取不属于自己的任务详情。使用用户 A 的 token 请求用户 B 的任务 ID 验证即可。

8. **工作流恢复只更新 runtime snapshot，没有同步 `WorkflowInstance`。**

   证据：`backend/workflow-service/.../WorkflowRuntimeRecoveryService.java:22-53`。

   影响/复现：服务重启后快照已恢复到 WAITING、SUCCESS 或 FAILED，但实例表仍可能是 RUNNING；前端读取实例列表时显示旧状态。让运行中的工作流在服务重启后查询列表即可观察。

9. **运行时终态保存顺序存在崩溃窗口。**

   证据：`backend/workflow-service/.../WorkflowRuntimeEngine.java:121-136`；`WorkflowRuntimeSnapshot.java:82-84`；`WorkflowRuntimeRecoveryRunner.java:20-29`。

   影响/复现：终态事件/快照与实例状态更新之间发生进程崩溃时，数据库状态可能落后；恢复器又只扫描 RUNNING/RETRYING 快照，导致已完成工作流无法自动纠正。

10. **人工审批拒绝被当作普通成功节点继续执行。**

    证据：`WorkflowAsyncCompletionService.java:44-53` 将 `approved=false` 构造成普通 `NodeResult.success`；`WorkflowAsyncCompletionService.java:80-88` 调用 `completeWaitingNode`；`WorkflowRuntimeEngine.java:228-263` 记录节点完成并继续 DAG；`frontend/src/stores/runStore.ts:199-208` 也固定将审批节点更新为 success；现有 `WorkflowAsyncCompletionServiceTest.java:87-115` 固化了拒绝后整体 `SUCCESS`。

    影响/复现：拒绝没有独立的拒绝终态、失败策略或强制拒绝分支协议。没有显式 `approved=false` 分支时，后继节点仍会执行；前端还可能显示整体成功。用“审批节点→发送通知/结束”的简单工作流点击拒绝即可验证。

11. **`NOTIFY` 节点可创建和保存，但重新打开工作流时无法回读。**

    证据：后端目录在 `WorkflowNodeCatalogService.java:531-533` 提供 `NOTIFY`；`frontend/src/stores/workflowStore.ts:35-50` 和 `frontend/src/api/mappers/workflowMapper.ts:20,64,577` 支持它；但 `frontend/src/services/api/workflowApi.ts:120-149` 的 `NODE_KIND_BY_BACKEND_TYPE` 漏掉 `NOTIFY`，`mapBackendDefinitionGraph()` 在 `:322-326` 对其抛出 `unsupported workflow node type`。

    影响/复现：包含通知节点的工作流能拖入并保存，但刷新或重新进入画布失败。创建一个带通知节点的工作流，保存后刷新页面即可复现。

12. **通知 SSE token 过期后不会自动重新申请。**

    证据：后端 `StreamTokenService.java:19-21,38-52` 将 token 设为约 60 秒有效；`frontend/src/services/realtime/realtimeClient.ts:278-322` 只在首次订阅时调用 `issueNotifyStreamToken()`，之后把旧 token 固定放入 SSE URL；`sseClient.ts:43-51,298-317` 将 401 视为不可重试；realtime client 在 `:310` 将其标记为永久不可用。

    影响/复现：连接首次在线超过约一分钟后，只要因网络、代理或空闲检测重连，旧 URL 会返回 401，SSE 不再重试，WebSocket fallback 也可能已被关闭。保持通知页打开超过 token 生命周期，再制造一次连接重建即可验证。

### P1/P2：数据闭环和产品可靠性

13. **知识库文档统计字段前后端命名不一致。**

    证据：`frontend/src/services/api/difyApi.ts:163-175` 映射后端 `recallCount`；`frontend/src/pages/knowledge/KnowledgePage.vue:850-858` 读取 `recalls`。

    影响/复现：知识库页面的召回次数显示为空或不更新，即使后端有数值。打开含有召回记录的文档详情即可观察。

14. **知识库创建是 Dataset→Document 两步调用，第二步失败会留下孤儿 Dataset。**

    证据：`frontend/src/stores/difyStore.ts:124-155`。

    影响/复现：文档上传/解析失败后，空 Dataset 已经创建且没有页面级回滚或清理，重复操作会积累无内容知识库。让文档创建接口失败后重新打开知识库列表即可观察。

15. **知识库上传/导入/初始化缺少统一的页面级重试和错误恢复。**

    证据：`frontend/src/pages/knowledge/KnowledgePage.vue:230-319`。

    影响/复现：网络抖动或后端部分失败时，用户缺少明确重试入口，向导状态可能停留在中间步骤；需要刷新页面或重新开始流程。

16. **知识库检索测试没有更新真实召回统计，chunk 分数和命中率是固定值。**

    证据：`backend/workflow-service/.../KnowledgeServiceImpl.java:167,181,193-195,217-234`。

    影响/复现：测试检索结果看似成功，但 `recallCount`、chunk score、hitRate 不代表真实统计，无法用于评估知识库质量。连续执行不同查询并对比文档统计即可发现数值不随结果变化。

17. **知识库页面的分隔符、清理空格、清理 URL 等设置没有传到后端。**

    证据：`frontend/src/pages/knowledge/KnowledgePage.vue:193-203,230-250` 维护这些控件；`frontend/src/stores/difyStore.ts:124-150` 创建请求没有传递完整配置。

    影响/复现：用户勾选设置后摘要可能显示已选择，但实际切分和清理仍使用后端默认行为，属于“控件存在但无效”。切换选项并检查导入后的 chunk 即可复现。

18. **退出登录没有清理业务 Store。**

    证据：`frontend/src/stores/authStore.ts:185-194` 只清理认证状态；文件、知识库、运行等业务 Store 没有同步 reset。

    影响/复现：同一浏览器切换用户时，短时间内可能看到上一个用户的文件、知识库或运行记录，直到各页面重新请求覆盖。用户 A 登录后加载数据，退出并登录用户 B 即可验证。

19. **通知 localStorage key 没有按用户隔离。**

    证据：`frontend/src/stores/uiStore.ts:29-30,126-153` 使用全局通知 key。

    影响/复现：已读状态、通知折叠状态或本地通知缓存可能跨用户串用；切换账号后会继承前一个账号的本地状态。

20. **大文件分片上传 session 只保存在单实例内存。**

    证据：`LocalChunkUploadService.java:39,70-88,209-220` 使用进程内 session map。

    影响/复现：服务重启、容器重建或负载均衡把后续分片转到另一副本后，session 不存在，上传中断且无法续传。多副本或重启上传服务即可触发。

21. **MinIO bucket 被设置为公共读，文件 metadata 返回直链。**

    证据：`backend/file-service/.../FileInfoServiceImpl.java:680-696`；`FileMetadataDTO.java:32-33`。

    影响/复现：部署环境可访问 MinIO 时，拿到 URL 的用户可能绕过 file-service 的登录和所有权校验直接读取文件。应将其视为越权读取风险，而不只是部署配置问题。

22. **Telegram 通知在数据库事务提交前发送。**

    证据：`backend/notify-service/.../NotificationServiceImpl.java:67-79`。

    影响/复现：数据库事务最终回滚时，Telegram 消息可能已经发出，产生“外部已通知但系统记录不存在”的不一致。让通知记录写入或事务提交阶段失败即可验证。

## 3. 审计发现的半实现能力（已补完可用闭环）

以下两项是审计基线中的未完成判定；保留原始证据用于追踪，当前实现结果见第 6 节。

23. **CODE 节点没有真实代码执行能力。**

    证据：`backend/workflow-service/.../CodeExecutionNodeExecutor.java:26-38`：未启用时直接报不可用；启用时也不执行 `config.code`，只返回 `executed=false` 和“必须由隔离执行器提供”的提示。前端 `frontend/src/components/workflow/NodeInspector.vue:1018-1022` 已经给出警告。

    判定：这是明确产品边界，不应在毕设说明或 UI 中当成已经完成的代码节点。若暂不实现，应继续清晰标记不可用并避免让节点进入可运行路径；若实现，必须使用隔离运行时、资源限制和超时控制。

24. **ITERATION/LOOP 节点没有执行嵌套子图或真实循环调度。**

    证据：`WorkflowNodeCatalogService.java:645-677` 明确说明 iteration 只输出 bounded list slice、loop 只输出状态 metadata；对应 executor 只做数据转换（`IterationNodeExecutor.java:20-31`、`LoopNodeExecutor.java:20-31`）；前端 `NodeInspector.vue:993-1016` 也展示了语义限制。

    判定：这是“节点名看起来已完成、实际只完成数据准备”的半实现。当前可作为受限 transform 使用，但不能宣传为循环执行或子工作流迭代。

## 4. 潜在风险与本轮未升级为确定缺陷的项

- AI workflow 内部接口和 notify internal 接口没有显式服务间 token；当前 Docker Compose 只使用 `expose`、没有映射宿主机端口，因此暂按纵深防御风险记录。生产环境若把服务端口暴露出来，需要重新评估。
- 文件直链、内部服务信任 `X-User-Id` 等机制依赖 Gateway 正确隔离和覆盖请求头；应在部署和集成测试中确认外部请求不能伪造这些头。
- 本轮未把“有后端实现但前端没有入口”的所有接口都视为缺陷，只有已能确认用户路径断链、状态错误或实际无效的项才列入上面的确认清单。

## 5. 已交叉验证正常的部分

- SSH 已由用户在本机验证成功：GitHub 返回 `Hi chyinan! You've successfully authenticated, but GitHub does not provide shell access.`
- 前端全量测试、生产构建和既有 check 脚本已通过；Maven 全量测试已通过；Python AI 服务和 `ai-runtime` 测试已通过。
- Gateway 已核对的前端公开 API 路径均有对应路由，原先的 `/ingestion/**` 断链已补齐。
- 用户审批的前端对话框、后端审批接口和登录用户所有权校验本身存在；问题在于“拒绝后的运行语义”不完整，而不是对话框不存在。
- workflowStore、workflowMapper、workflowApi 和后端 catalog 均支持 `NOTIFY` 回读。
- SSE 客户端具备普通网络错误的重连逻辑；本轮确认的缺陷是 401 token 过期被错误归类为永久不可用，且没有刷新 token 的重连路径。

## 6. 本轮修复结果与剩余边界

本轮已按以下范围完成修复并补充回归测试：

1. `/ingestion/**` Gateway 路由、`NOTIFY` 回读、审批拒绝语义、SSE token 刷新已修复。
2. 任务/文件所有权校验、MinIO 私有下载、内部服务鉴权和文件分类持久化已补齐。
3. runtime snapshot、`WorkflowInstance` 状态同步、恢复和重复回调路径已补齐。
4. 项目资源关联与统计、文件列表替换式刷新、分片上传共享会话已补齐。
5. 知识库真实召回统计、导入设置、失败补偿清理和页面重试已补齐。
6. 前端 Store 登出清理、通知用户隔离和运行时 token 生命周期已补齐。
7. 通知事务边界和 Python runtime 缺失时的状态降级已补齐。
8. CODE 节点已通过隔离 Python runtime 执行；ITERATION/LOOP 已支持带 `bodyNodes` 的有界嵌套执行，并保留次数和 body 节点上限。

仍需在真实部署环境验证的外部条件：MinIO/Redis/MySQL/RabbitMQ/Nacos、Ollama/Whisper 模型和实际 Telegram 凭据。这些属于运行环境依赖，不再作为代码中的假成功处理。

## 7. Git 工作区状态与复验状态

当前分支为 `graduation/chyinan-maintenance`，维护改动待作为一次整体逻辑提交。全量测试、契约检查、Python 编译、Compose 配置和 `git diff --check` 均已完成；提交后仍需保留真实依赖环境的人工冒烟验证。
