# AetherFlow 维护残余修复记录（A01–A19）

执行时间：2026-10-25（Asia/Shanghai）
隔离工作区：`D:\Programs\_af_pr83_inspect`，分支 `fix/residual-batches`，基线 = PR83 head `515a4b04c7969423ea6467f9ed4ad01c170b4807`
状态：19 项全部修复并提交为 7 个本地提交；**未推送、未合并、未发布、未部署、未改设置**
前置矩阵：`summary/maintenance-residual-status-2026-10-24.md`（该文件记录修复前的"仍成立"结论与证据，本文件为其修复结果）

---

## 1. 提交清单

| 提交 | 覆盖项 | 说明 |
| --- | --- | --- |
| `dc216e2` | A16、A02(前端)、A06(前端)、A13(前端回归)、A19 | 翻译节点 Provider 配对、模型 ID 碰撞、变量赋值器校验派生、CODE 示例契约 |
| `927a04a` | A10、A11、A06(mapper) | 运行表单变量默认值漂移、并发保存持续 409、非法 JSON 不再静默保存旧值 |
| `915e4a7` | A12、A04 | Copilot 历史恢复竞态、待确认草稿摘要截断 |
| `c4b8b70` | A05 | 通知历史与实时通知的绝对时间契约 |
| `4ac2c4f` | A14、A09、A17 | 分支共享汇聚点入度、异步完成变量仲裁、下游失败终态 |
| `558f097` | A01、A02(后端)、A13(后端)、A15 | Mapper 装配、模型目录 ID 唯一性、结构化 LLM 结果适配 |
| `b220c3a` | A18、A08、A03、A07 | 嵌入超时分片、复杂 metadata 候选截断、Comfy 源图覆盖、自定义放大预检 |

---

## 2. 逐项结果

格式：编号 → 结论 → 主要改动 → 回归用例（均为新增或扩展）→ 红/绿证据来源。

**A01 取消清理 Mapper 未注册（P1）** → 已修：`@MapperScan` 增加 `com.aetherflow.workflow.runtime.cancellation`。
用例：`WorkflowServiceApplicationMapperScanTest`（`mapperScanCoversEveryMapperInterfacePackage`、`registersCancellationCleanupMapperBeanDefinition`），用 MyBatis `ClassPathMapperScanner` 断言 BeanDefinition 真实注册，**不是**只加注解。
红：`runtime.cancellation` 不在名单 + 已注册 bean 列表无该 mapper；绿：2/2。未运行真实启动栈（无 DB）。

**A02 模型目录有损 ID 碰撞** → 已修：id = `model-<provider>-<slug>-<sha256(provider:完整模型名)[0:8]>`，稳定无随机；目录 id 不入库（已确认仅响应层使用）。前端新增 `modelAtSelectedOption()`：id 唯一按 id 解析，id 重复按行位置解析，定位失败不写任何模型；LLM 段失败分支由"清空"改为"保留原配置"。
用例：`ProviderCatalogServiceTest`（碰撞区分、跨构建稳定）、`NodeInspector.modelCatalogCollision.test.ts`。
红：两模型同为 `model-ollama-qwen2-5-7b`；选中第二行写回第一行。绿：6/6、3/3。

**A03 ComfyUI 源图同名覆盖** → 已修：每次执行生成 `aetherflow-src-<uuid><ext>` 上传名，工作流仍引用上传返回的 name，未改权限与隔离语义。
用例：`ComfyUiProviderTest`（两次执行上传名不同、重试沿用自身 name），既有 `ImageProviderFailureStagesTest` 断言改为"唯一名前缀 + 保留扩展名"。
红：`source.png` == `source.png`；绿：17/17 + 55/55。

**A04 Copilot 待确认草稿被摘要器截断** → 已修：`redactCopilotValue` 增加可选 `maxDepth`（默认 3 不变），pendingDraft 序列化用 6；400 字符截断、20 项/键上限、secret 键 `[redacted]` 全部保留。
用例：`AICopilotPanel.test.ts` 的 pendingDraft 用例扩展（inputs/outputs/request.headers 为对象、`Authorization` 仍脱敏、payload 不含明文）。
红：`'[nested data omitted]'`；绿：用例通过（copilot 目录 120 例全绿）。

**A05 通知历史与实时时间契约** → 已修：新增 `normalizeNotificationTimestamp` / `notificationEpoch`，无 `Z`/`±HH:MM` 的字符串按配置服务器偏移（`VITE_SERVER_TIMEZONE_OFFSET`，默认 `+08:00`，见 `runtimeEnv.serverTimezoneOffset`）补齐；`uiStore.normalizeRecord`、`notificationTime`、`addNotifyMessage` 统一走该解析。
用例：`notificationHistory.test.ts` 新增 5 组（同刻不反转、UTC/上海两种进程时区一致、21→20 截断、已读只前进、断线回放），`uiStore.notificationTimezone.test.ts` 2 组。
红：`[history, live]` vs 期望顺序、`18:00:00` vs `10:00:00`；绿：27 文件 / 247 例通过，`npm run check:notifications` exit 0。

**A06 Variable Assigner 模式往返清错存旧值** → 已修（两端）：前端 `valueValidationError` 改为 computed 派生、删除模式切换的单向清空与存储型错误写入；`valueJsonText` 始终保存最新原文、`config.value` 仅解析成功时更新。mapper 新增 `normalizeVariableAssignerValue`：`valueType=JSON` 且有 `valueJsonText` 时以解析结果为保存值，解析失败抛 `VARIABLE_ASSIGNER value must be valid JSON`；无 `valueJsonText` 的旧数据仍用 `config.value`。
用例：`NodeInspectorVariableAssigner.jsonValidation.test.ts`（4 例）、`workflowVariableAssignerJson.test.ts`（9 例，含对象/数组/null/布尔/数字）。
红：config 残留 `valueValidationError` / `{stale:true}` 直接落库；绿：4/4、9/9。

**A07 自定义 Comfy UPSCALE 被内置 SD 目录拦截** → 已修：有实际执行图时 UPSCALE 与生成一样按图判定，不再查内置 `upscalers`；内置（无自定义图）UPSCALE 校验保留；`ImageConnectionDiscovery` 能力由节点类型推导；执行器与预检对 UPSCALE 也传 `workflowNodeTypes`；前端导入 API 图时 UPSCALE 跳过 upscaler 目录校验并隐藏该下拉，同时删除已无触发点的 `ignoredUpscaleWorkflow` 三语文案。**未重复处理 bindings 持久化**（基线已覆盖）。
用例：`NodeConnectionServiceTest`（自定义图不过内置目录、内置 UPSCALE 仍校验）、`ImageConnectionDiscoveryWorkflowTest`、`nodeConnectionChecklist.test.ts`。
红：`所选 upscalers 不在服务目录中：Lanczos`；绿：13/13、2/2、27/27。

**A08 Qdrant 复杂 metadata 在候选截断后过滤** → 已修：新增 `semanticCandidateLimit`（含 Map/List/null 时直接取 `MAX_SEMANTIC_BUFFER=1000`，标量仍 `max(50, topK*20)`）与 `shouldWidenSemanticWindow`（窗口被填满仍不足 topK 时放大一次再本地 Top-N）；未改魔数、未引入词法回退。
用例：`KnowledgeServiceImplTest` 三例（第 51 条命中、标量路径保持窄窗、无匹配返回空）。
红：topK=1 时返回 `[]` 且 `search(…,1000,…)` 从未调用；绿：42/42。

**A09 异步完成与重跑变量覆盖顺序** → 已修：`completeWaitingNodeLocked` 删除 `putAll`，改走 `restoreVariableWriters` + `mergeVariables`；抽出共用 writer 恢复，正常并行/异步完成/冷恢复/重跑 seed 使用同一仲裁（深度大优先、同深度 nodeId 小优先）。
用例：`WorkflowRuntimeEngineTest` 两例、`FailedNodeRerunVariableWriteOrderTest` 一例（原运行与重跑的节点输入逐字段相等）。
红：`winner=SHALLOW` / `winner=Z`；绿：3/3。

**A10 LLM 清空输入变量后运行表单与落库默认值不一致** → 已修：`workflowMapper` 导出 `LLM_PROMPT_VARIABLE_DEFAULT='question'` 与 `normalizeLlmPromptVariable()`，`WorkflowPage` 运行表单删除本地 `'prompt'` 回落、改调同一函数；显式旧配置不变。
用例：`workflowRunPromptVariableAlignment.test.ts`、`llmPromptVariableDefault.test.ts`。
红：`[data-run-input="question"]` 不存在；绿：2/2、4/4。

**A11 并发保存导致持续 409** → 已修：保存串行化（per-store 队列 + 加载代次换队列，队列空闲时同步起跑以固定调用瞬间的画布身份）；迟到成功回执仅吸收更大的 `backendVersion`；409 时 `refreshSaveBaselineAfterConflict()` 只读 GET 刷新基线，不重载画布、不清草稿、不覆盖远端，下次保存即可成功。
用例：`workflowSaveSerialization.test.ts`（4 例）+ 既有 `workflowSaveOwnership.test.ts` 的重叠保存矩阵改写为串行语义（保留"迟到响应不得覆盖当前状态"）。
红：第二个 PUT 并发、`expected 5 to be 6`；绿：4/4 + 17/17。

**A12 Copilot 历史恢复未完成就按错误模式发送** → 已修：解锁点移到历史恢复之后（`finally` 统一解锁，异常不锁死）；新增 `adoptLateConversationHistory`，在面板未卸载、作用域未变、无在途请求、未主动切会话/模式、本地仅为"快照+本次新增"时前插历史并恢复规划模式。
用例：`AICopilotPanel.historyRace.test.ts`（5 例）。既有用例 `allows a selected conversation to continue while its messages are still loading` 因固化缺陷行为被有意改为 `waits for the selected conversation history before continuing it`。
红：发送按钮未 disabled、迟到历史失联；绿：5/5（copilot 目录 120 例全绿）。

**A13 CONDITION 标量比较值被 OBJECT 契约拒绝** → 已修：catalog 中 CONDITION 的 `value` 与输入 `variable` 类型 OBJECT→JSON（校验走 `isJsonValue`），`config.variable` 仍 STRING 必填，枚举与必填校验保留；前端本就写标量，无需改动，补回归锁定。
用例：`WorkflowNodeConfigValidatorTest` 5 例（字符串/数字/布尔/空串/结构化/无值操作符零违规、NaN 仍拒）、`NodeInspectorConditionScalarValue.test.ts`。
红：`config field 'value' must be OBJECT`；绿：16/16、2/2。

**A14 HTTP BRANCH 共享 END 入度未释放** → 已修：新增 `releaseUnselectedEdge`（先无条件释放未选边入度；`remaining==0` 且存在被选中入边才调度；否则交给 `markSkippedNode` 跳过传播，且不再自减自身入度、去掉前驱守卫）；`remainingPredecessors` 对已完成节点按 `declaredNextNodeIds` 全量递减以支持冷恢复。
用例：`WorkflowRuntimeEngineTest` 5 例（成功/错误两路共享 END、普通菱形、多层汇合、冷恢复）。
红：`workflow runtime completed with incomplete expected nodes: [end]`；绿：5/5。

**A15 结构化 LLM JSON 未适配** → 已修：`AiWorkflowNodeResultAdapter` 新增 `structuredResult/structured`（jsonData → metadata.jsonData → 剥 ```json 围栏解析 completionText，仅接受顶层对象）；classifier 取不到 route 明确报错且校验 route 属于配置 routes，裸标签仍兼容；extractor 走同一入口，`{}` 视为合法空结果；ai-service `LlmNodeExecutor` 在 `structuredOutput=true` 时补权威 `jsonData`。
用例：`AiWorkflowNodeResultAdapterTest`（+9）、`QuestionClassifierNodeExecutorTest`（3）、`ParameterExtractorNodeExecutorTest`（2）、ai-service `LlmNodeExecutorTest`（+4）。
红：整段 JSON 被当 branchKey、`params` 为空、坏 JSON 静默通过；绿：13/13、3/3、2/2、5/5。

**A16 TRANSLATE 模型切换保留旧 provider** → 已修：翻译选择器 option 改 `model.id`，新增 `selectedTranslateModelId()` / `handleTranslateModelSelection()` 原子写 `{model, provider}`，仅显式清空才回落服务默认路由。
用例：`NodeInspector.translateModelPair.test.ts`（4 例）。红：写入 `undefined` 的 provider；绿：4/4。

**A17 异步完成后下游失败缺终态** → 已修：`completeWaitingNodeLocked` 用 try 包住 `executeDag` 与终态迁移；取消原样上抛；其它异常 → FAILED、`markFailed(failedNodeId)`（归因真正失败的下游节点）、发布 `WORKFLOW_FAILED`、`saveSnapshot`、再抛 `unwrapNodeFailure`。之后 `recoverRunnableWorkflows()` 不再捞到该运行、executor 只调用 1 次。
用例：`WorkflowRuntimeEngineTest` 3 例。红：异常直接逸出、快照停 RUNNING；绿：3/3。

**A18 Embedding 超时后仍处理后续分片** → 已修：整次执行引入绝对截止时间，分片循环入口检查 `isInterrupted()` 与 deadline，超时不再启动下一片；`cancel(false)` + `handleOrphanBatch()`（warn 日志 + `EmbeddingMetrics` 孤儿批次计数）。正常多片语义不变。
用例：`EmbeddingNodeExecutorTest` 3 例（超时只调用 1 次、正常多片有序、重试不被旧批次污染）。
红：`expected 1 but was 3` / `expected 4 but was 6`；绿：6/6。

**A19 CODE 默认示例参数数目错误** → 已修：`workflowMock` 默认代码改 `def main(payload): return payload`，`NodeInspector` 占位示例同步；未改动"默认值来源"机制（按确认只对齐 mock 示例）。
用例：`workflowMock.codeContract.test.ts`（2 例）。红：默认代码含 `arg1/arg2`；绿：2/2。

---

## 3. 集成验证（本轮真实执行）

### 后端（`mvn -o -B -Dmaven.test.failure.ignore=true test`，隔离工作区）

| 模块 | 修复前（PR83 head） | 修复后 |
| --- | --- | --- |
| common | 16 | 16 |
| workflow-runtime-api | 11 | 11 |
| gateway | 49 | 49 |
| auth | 70 | 70 |
| workflow-service | 669（21F+3E） | **706（21F+3E）** |
| task | 35 | 35 |
| ai-service | 327（1F+2E） | **339（1F+2E）** |
| file | 65 | 65 |
| notify | 16 | 16 |
| 合计 | 1258（22F+5E） | **1307（22F+5E）** |

失败用例集合与基线**逐项一致**（`WorkflowNodeCatalogControllerTest:215`、`HttpRequestNodeRetryTest` 19F+3E、`NestedWorkflowRecoveryTest` 1F、`CopilotServiceImplTest` 1F+2E），全部为基线既有问题，本轮未修、也未新增。新增 49 个用例全部通过。

### 前端（隔离工作区）

- `npx vitest run`：**240 文件 / 2397 用例通过**（修复前基线 240 文件 / 2394 用例，新增 3 件/若干例）
- `npm run build`（`vue-tsc -b && vite build`）：exit 0
- 契约脚本：`check:workflow-mapping`、`check:workflow-branch-routing`、`check:workflow-editor-p0`、`check:workflow-model-options`、`check:notifications` 全部 exit 0

---

## 4. 未验证项与限制（必须原样引用）

- 无 Docker / MySQL / Redis / Nacos / Qdrant / ComfyUI / Ollama：**未做**真实启动栈、真实模型、真实向量库、真实图像服务、真实 MQ 重投的验证；A01 用 MapperScanner 契约用例替代 `@SpringBootTest`，A08/A03/A07 用 mock 与 `MockRestServiceServer` 替身。
- 未做真实浏览器验收（拖拽、焦点、像素级问题不属于本轮 19 项）。
- 生产 JVM/DB 时区未核验：`VITE_SERVER_TIMEZONE_OFFSET` 必须与后端实际时区一致，默认 `+08:00`。
- A11 的跨标签页/跨页面实例冲突仍走 409 → 只读刷新基线路径（队列不跨实例共享）。
- A12 中"发现型会话（无存储选择）加载期间仍允许发送，靠补偿兜底"为有意取舍。
- 基线红 24 例（含 ai-service 3 例）仍存在，不在本轮范围。
- C 附录 21 项未处理；C10 的文案部分已随 A07 清理。

## 5. 回滚

`git revert` 单条提交即可；7 个提交按批次相互独立（引擎、装配/契约、检索/图像、前端四个批次）。工作区无未提交改动。
