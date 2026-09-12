# 开题报告承诺与企业产品完成度审查

审查日期：2026-09-12。对象：用户指定的“陈胤安 广州工商学院本科毕业论文（设计）开题报告  (2).docx”和当前 AetherFlow 工作区。

**结论：文档与项目存在实质不一致。核心模块与 8 类节点大多已有实现，但部分正常入口、文件隔离、故障恢复和数据生命周期存在确定缺陷；当前不能认定为功能完整、可承受大并发的企业级产品。**

## 本轮修复状态（2026-09-12）

已在当前工作区完成代码修复并补充回归覆盖：首次幂等启动 Outbox、事件流跨页、恢复锁内快照重读、OAuth 网关放行、成员归属、Export 对象键隔离、FFmpeg muxer/超时、Whisper readiness 与预处理线程化、知识库失败状态/Qdrant 文档向量删除和文档 ready 过滤、工作流定义快照冻结、认证指标改用 Redis SCAN、运行详情节点属性展示、跨 Provider Ollama 模型解析。

这些修改已通过本地单元测试、构建和静态契约检查。随后使用当前源码重新构建 Compose 镜像并启动了 25 个服务；修复 RabbitMQ 幂等启动脚本后，RabbitMQ 重启次数为 0，关键服务全部 healthy，真实部署门禁和三个公开健康入口均通过。性能门禁正反例和 JMeter 契约测试也通过，但这仍不是持续真实 AI/文件混合负载容量证明，也不替代多副本故障注入、OAuth 回调、真实模型推理、Qdrant 联测和灾备恢复验收。

仍未完全收口的部分：取消传播失败后的持久补偿、运行产物关联和大媒体引用化、团队成员到共享工作区的真实 RBAC、工作区超时/保留策略消费方，以及真实持续容量、告警送达和灾备恢复证据。F01–F12、F14–F16 的源码问题已完成修复并有回归覆盖；F13 的完整产物闭环、F17 和 E01–E04 仍需按验收条件继续收口。

这份文档是开题报告，其中“研究方案”属于拟实现、拟验证的目标，不能直接当作已完成证明。本次按这些目标逐项验收，并加入用户要求的企业稳定性标准。没有用“毕设够用”降低标准，也没有据文件数量或测试数量计算虚假的完成百分比。

## 1. 审查范围与证据

- 读取指定的最新版 (2).docx，提取全部非空段落；正文没有 w:ins/w:del 修订节点。原文编号 P001–P130，包含空段落的编号间隔，**不是 Word 页码**。[原文提取](D:/Programs/AetherFlow/summary/thesis-promises-2026-09-12.txt)。
- 文档 SHA-256：`88406043ffbecd5de029c9c685113145ff794cc49f03ef2b3f8eaff1c4e5efa1`。
- 代码基线：HEAD `b180163192555f0e13ad8ee7f603ef106f3ae59a` 加当前全部未提交改动。不能据此断言本地或远程已部署镜像具备同样行为。
- 采用四组并行调查，沿 UI → API → 服务 → 数据库/外部依赖追踪。旧审查只用作线索，关键结论重新读代码。
- 实际执行现有单测、前端构建、14 项前端契约检查、性能门禁自测及 Compose 配置校验；三个运行时缺陷另做独立 Java 复现，FFmpeg 格式问题使用本机真实工具验证。
- 本次使用 Docker Desktop Linux Engine 29.4.1 重新构建并启动当前源码镜像；执行了真实 Compose 健康检查和公开入口检查。没有执行破坏性故障演练、真实 AI 推理容量压测、OAuth 回调联测或灾备恢复；未修改原 Word。

本报告中的“有实现”表示找到了可执行链路；不等于已部署、不等于所有组合可用，更不等于高并发验收通过。“未完成”包括具体断链和缺失的验收能力；“未验证”单独注明。

## 2. 文档承诺逐项矩阵

以下矩阵记录修复前基线，便于追溯原始差距；当前修复状态和 Docker 实测结果以本节开头的“本轮修复状态”和第 5 节为准。

| 文档位置 | 功能承诺 | 当前判定 | 实现与差距 |
|---|---|---|---|
| P045 | 注册、账号密码登录、信息维护、退出 | 有实现 | Auth API、账户页和凭证管理存在；不能据第三方登录缺陷否定整个认证模块。 |
| P045 | 第三方账号登录 | **链路未完成** | GitHub/Google 适配与按钮存在，但登录前 Provider 查询被默认网关鉴权拦截，GitHub 授权/回调同样缺放行。见 F02。 |
| P046 | 统一认证与访问控制 | **部分完成** | 网关鉴权、用户归属和短期内部令牌存在；导出节点仍能穿透文件对象归属边界。见 F04。 |
| P048 | 工作流创建、编辑、保存、复制、删除、列表 | 有实现 | 前端、API 与数据库实现存在，保存还有版本冲突检测；排队后定义可变会破坏已提交实例语义。见 F05。 |
| P048 | 预设工作流模板 | 有实现 | 模板入口及应用流程存在；含外部 AI 的模板仍受 Provider 配置/能力预检约束。 |
| P049、P083 | Vue Flow 拖拽、连线、DAG 编排 | 有实现 | 画布、序列化、分支映射与后端执行器存在，29 类前端节点映射检查通过。 |
| P049 | 循环依赖、连接、配置合法性校验 | 有实现，仍需扩展边界测试 | 服务端 DAG 和节点配置校验存在；不能用它证明所有合法配置都能执行成功，FFmpeg 格式和 Export 路径就是反例。 |
| P049、P063–064 | 启动后异步推进并记录状态 | **正常入口存在阻断** | 携带新幂等键时创建 PENDING 后跳过 Outbox，前端正常启动默认带键。见 F01。 |
| P053 | 文档/图片/音视频文件输入 | 有实现 | 文件上传、fileId/元数据传递及后续节点解析存在；文件仍需按需下载处理，文档表述不能理解成服务间永远不传文件字节。 |
| P054 | 独立 FFmpeg 提取音轨、格式转换 | **部分完成** | 独立节点到 Python 的链路已实现；公开支持的 m4a、aac 格式使用错误 muxer 参数。见 F08。 |
| P055 | Whisper 转录及时间信息 | 有实现，但健康与并发隔离有缺陷 | 真正 faster-whisper 调用和带时间信息的字幕输出存在；默认关闭，需准备模型/计算资源；模型加载失败会错误宣告 ready，预处理阻塞事件循环。见 F15/F16。 |
| P056 | OpenAI、Ollama 文本生成/总结/翻译/参数 | 有实现，依赖配置 | LLM 执行、模型/提示词/参数传递存在；总结翻译由提示词完成，不需要各自独立引擎。跨 Provider 降级另有缺陷。 |
| P057 | 图片、扫描文档 OCR | **部分完成** | auto/Tika/Tesseract 和中文语言包存在；混合 PDF 会漏扫描页，100 万字符上限未覆盖 OCR 分支；真实质量未验收。 |
| P058 | Embedding 向量化 | 有实现，当前承诺 Ollama | 可执行实现为 Ollama；未列出未实现的 OpenAI/HuggingFace 是正确的能力收敛。 |
| P040、P042、P058、P086 | 知识库加工、语义检索、RAG 基础 | **生命周期不完整** | 分片、父子上下文、向量索引和检索存在；追加失败可使整库不可检索，删除文档未清理对应向量。见 F07/F09。 |
| P059 | Stable Diffusion、ComfyUI 图像生成 | 有实现，默认关闭/待外部配置 | 两个真实 Provider、参数执行和产物登记存在，不能认定“只有壳”；真实模型质量、吞吐未验收。 |
| P060 | 输出整理、查看、下载 | **部分完成** | End/Export、文件页下载存在；运行详情用事件名代替实际输出，产物固定为空；输出对象键可越权覆盖。见 F04/F13。 |
| P061 | 统一节点输入/配置/输出及扩展 | 有实现 | 节点目录、统一执行接口和结果适配存在；新增节点还需同步目录/校验/前端映射，非零改动插件热加载承诺。 |
| P063 | 长任务提交与执行解耦 | 有实现但需先修 F01 | RabbitMQ、Task Service、AI 异步调用及结果回传存在。 |
| P064 | 超时、重试、失败、取消、恢复 | **部分完成** | 状态机、扫描器、租约、CAS 和补偿存在；恢复会用旧快照重执行完成节点，定义冻结、租约和取消还有缺口。见 F05/F06/F12。 |
| P064 | 开始时间、节点、进度、结果、异常记录 | **部分完成** | 状态、时间与日志存在；运行详情未接真实节点输出，超过 500 事件时推送停止。见 F03/F13。 |
| P066–067 | 输入/中间/输出文件统一管理与标识传递 | **部分完成** | File Service/MinIO 和 AI 产物登记存在；普通文本需显式 Export，大媒体仍完整 Base64 跨服务传递；还存在对象隔离缺陷。见 F04/F17。 |
| P070、P084 | SSE/WebSocket 实时状态、日志和终态反馈 | **部分完成** | 两种通道、短期 token、游标存在；500 条分页边界破坏后续反馈。见 F03。 |
| P072 | Provider、模型、参数、调用优先级配置 | 有实现 | 配置页、路由策略和 Redis 持久配置存在；生产需要正确共享 Redis/TLS 配置。 |
| P073 | 超时/限流/异常后自动切换 Provider | **常见跨模型场景不成立** | 有熔断、重试、候选路由，但切换时继续传原模型名；OpenAI gpt-* 不会自动变成 Ollama 的 llama/qwen。见 F10。 |
| P073 | 切换及故障恢复过程记录 | **部分完成** | LLM 有事件/指标及恢复记录，Redis 仅保留最近 200 条；图像主要是应用日志，未接同等事件链；真实切换仍需验证。 |
| P077、P081–084 | Spring Cloud/Vue/Python/MySQL/Redis/Nacos/Gateway/Feign/Sentinel/RabbitMQ | 有实现 | 服务模块与实际调用路径存在。组件齐全不等于高可用。 |
| P083 | Seata 服务治理 | **范围需写准确** | 依赖、配置和 dev 跨服务事务示例存在；生产工作流启动采用本地事务 + Outbox，并非由 Seata 保证整个 AI 流程全局回滚。 |
| P078、P086 | 功能、接口与典型 AI 全流程验证 | **部分完成** | 单测与契约验证丰富；本次发现的主流程缺陷说明真实网关/MySQL/队列/对象存储联测仍不足。 |
| P086 | 高并发提交、MQ处理与服务保护稳定性 | **尚无合格验收证据** | 现有压测计划不等待实例完成、不执行真实 AI 负载；未找到本工作区对应的持续容量/故障演练结果。见 E01/E02。 |
| P090 | 普通服务器、较低运行成本 | 条件性目标 | 软件可容器部署；Whisper/图像/LLM 的可接受延迟、并发和成本取决于模型与硬件，当前证据不能外推“普通服务器高并发低成本”。 |

## 3. 必须优先修复的具体问题

级别：P1 表示企业发布前必须处理的核心功能、安全、数据或可靠性问题；P2 表示局部能力缺陷。确定的源码路径与轻量复现不等于真实集群故障演练。

### F01 · P1：首次携带幂等键启动，实例停留 PENDING

[WorkflowServiceImpl.java](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:223) 在 insertIdempotent 后查询刚插入的行，查询非空便返回，跳过同方法第 233–234 行的 Outbox 创建与提交后派发。数据库映射用 generated key 回填 ID，所以“查到行”不能区分首次插入和重复请求。

[WorkflowPage.vue](D:/Programs/AetherFlow/frontend/src/pages/workflows/WorkflowPage.vue:419) 正常启动即传入幂等键。不是只能手工构造请求触发的边缘情况。

独立 Java harness 复用现有服务夹具，模拟数据库正常回填/回读，实际结果：

```text
无幂等键：插入实例，Outbox insert = 1
新幂等键：插入实例，status = PENDING，Outbox insert = 0，runtime calls = 0
```

[复现输出](D:/Programs/AetherFlow/summary/audit-runtime-repro/result.txt)。已有测试覆盖“无键”和“已有键重放”，漏掉“新键第一次提交”。

验收要求：首次插入与并发重放都保证同一事务内恰好一条实例和启动 Outbox；真实 MySQL + 正常 UI 启动最终完成；重复提交只返回同一实例。

### F02 · P1：第三方登录在默认网关入口断开

登录页先请求 /auth/oauth/providers，失败即禁用两个按钮。网关允许列表有 /oauth2/**、/login/oauth2/**，却没有 /auth/oauth/providers 和 GitHub 的 /auth/oauth/github/... 路径；未登录请求被返回 401。

证据：[登录页查询与失败处理](D:/Programs/AetherFlow/frontend/src/pages/auth/LoginPage.vue:64)；[默认网关允许列表](D:/Programs/AetherFlow/backend/gateway-service/src/main/resources/application.yml:140)；[无 Bearer 拒绝路径](D:/Programs/AetherFlow/backend/gateway-service/src/main/java/com/aetherflow/gateway/filter/JwtAuthenticationFilter.java:47)。

因此配好 OAuth client secret 仍不足以让正常登录页可用。若部署环境自行在 Nacos 覆盖了这些路径，需单独验证该环境，本仓库默认配置仍有缺陷。

验收要求：通过真实 Nginx/Gateway 从未登录浏览器完成 Provider 查询、授权、回调和入站凭证转换，同时保留 state/回调校验。

### F03 · P1：超过 500 条运行事件后，SSE/WebSocket 不再推进

[RuntimeEventStreamService.java](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/stream/RuntimeEventStreamService.java:118) 找到缓存内游标后直接返回缓存剩余部分；缓存每次仍加载最早 500 条。游标到第 500 条便永远得到空列表，不调用数据库增量查询，缓存过期也无法推进。

已用 501 条持久事件的独立 Java harness 复现：首批 500，after event-500 返回 0，增量查询次数 0，末尾终态事件隐藏。两种流共用此逻辑。

验收要求：跨 500/1000 边界、断线续传及多轮缓存刷新均无遗漏；完成/失败/取消事件必须可达。

### F04 · P1：导出节点可覆盖其他用户的存储对象

[ExportNodeExecutor.java](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java:182) 原样接受用户配置的 objectKey，只去掉首尾斜杠。执行顺序是先 putObject，再登记元数据；登记失败还会 removeObject。

[先写对象与失败删除](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/ExportNodeExecutor.java:63)；
[元数据登记](D:/Programs/AetherFlow/backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java:301) 只确认用户 ID 有效，未确认现有 bucket/objectKey 所属用户。

条件：已登录用户知道另一个用户在共享 bucket 下的对象键，并提交对应 Export 配置。影响是覆盖对方内容；登记失败清理还可能删除对方对象。不能用“对象键难猜”替代授权。

验收要求：服务端生成租户/实例隔离键；用户不能指定任意全局对象位置；覆盖和清理前验证本次操作所有权；做双用户隔离和失败补偿联测。

### F05 · P1：提交实例没有冻结执行定义

[派发读取当前定义](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/service/impl/WorkflowServiceImpl.java:319) 在稍后派发时重新读取可变 definitionJson；启动 Outbox 只记录实例 ID。用户在提交后、派发前编辑定义，会执行另一个版本；删除定义则落入每 5 秒重试路径。

验收要求：实例/Outbox 在启动事务中保存明确的定义版本或不可变定义快照；排队期间编辑删除模板不改变已提交实例，永久性错误有明确终态和保留策略。

### F06 · P1：租约接管未充分阻止过期副本重新认领

[先 Redis acquire 再 SQL claim](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java:255)；
[无代际比较的 claimForLease](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/mapper/WorkflowRuntimeSnapshotMapper.java:36)。

可触发序列：A 取得 Redis 租约后长暂停；租约过期，B 接管并将 SQL token 改为 B；A 恢复后执行无条件 claimForLease，把 token 写回 A。健康检查此刻只看内存 lockLost，首次续约还没执行。随机 UUID token 没有表达新旧代际，后续 SQL 按“当前 token 相等”无法阻止这次倒退认领。

这是代码级故障时序推导，尚未在真实 Redis/MySQL 多副本环境注入暂停复现。验收应覆盖暂停超过 TTL、接管、旧副本恢复，并证明旧副本不能认领、写状态或重做外部副作用；单纯增加线程或扩大 TTL 不能证明安全。

本轮已将 durable claim 改为按“读取到的旧 fencing_token”做数据库 compare-and-swap；并发接管后旧副本的 UPDATE 影响行数为 0，并抛出租约丢失异常，不再覆盖新持有者。真实多副本暂停演练仍需在发布前执行。

### F07 · P1：追加文档失败/取消后，已有知识库可能持续不可检索

[数据集导入状态更新](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/mapper/KnowledgeDatasetMapper.java:68)：startIngestion 把整个数据集设 processing；同文件第 49–66 行的 failIngestion/cancelIngestion 只调整计数，不恢复 ready。[检索 ready 门禁](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java:609) 拒绝所有非 ready 数据集。

条件：已有可用文档的数据集追加一个最终失败或被取消的导入，且没有其他后续成功导入将状态改回 ready。原有资料仍存在，但整库及引用它的工作流不能检索。

验收要求：失败新文档不下线已有可检索数据；数据集可用性与单个导入任务状态分开维护，并覆盖并行导入、失败重试和取消。

### F08 · P2：FFmpeg 声称支持的 m4a/aac 转换实际失败

[Python FFmpeg 实现](D:/Programs/AetherFlow/python-ai-service/app/main.py:582) 允许 wav/mp3/m4a/aac/mp4，却在第 602 行把扩展名直接用于 -f。m4a 和 aac 不是这里正确的 muxer 名。

本机真实 ffmpeg 最小音频转码：wav 成功；m4a、aac 均返回 Requested output format ... is not known。已有测试替换 subprocess，不会捕获此错误。

验收要求：按容器格式映射 muxer/编码器或让输出扩展名参与正确自动推断；所有公开格式用真实 ffmpeg 验证可解码及音轨属性。

### F09 · P1：删除知识文档没有删除对应 Qdrant 向量

[deleteDocument](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/service/impl/KnowledgeServiceImpl.java:556) 删除 MySQL 文档/分片/作业，但没有对应向量删除；索引接口有 deleteDataset，没有文档删除契约。

删除后的向量仍可能挤占向量服务返回的有限候选，随后本地按不存在的 ID 过滤，导致结果不足甚至空。这里不是断言已删除正文一定泄露：当前二次查询会滤除不存在的分片；明确风险是索引残留、检索完整性与容量累积。

验收要求：文档删除/重建与向量索引有可重试、可对账的同步删除；大量删除后相关存量文档仍可命中。

### F10 · P1：跨 Provider 降级保留原模型名，常见备用模型无法接管

[AiProviderRequest.withProvider](D:/Programs/AetherFlow/backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRequest.java:39) 只替换 Provider，保留 model；
[Router 派发](D:/Programs/AetherFlow/backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRouter.java:175)；
[传给 Python](D:/Programs/AetherFlow/backend/ai-service/src/main/java/com/aetherflow/ai/provider/PythonRuntimeAiProvider.java:132)。

例如主模型为 OpenAI gpt-*，备用为安装了 llama/qwen 的 Ollama：故障后 Ollama 仍被要求执行 gpt-*，通常继续失败。若多家服务提供相同模型别名则可能成功，因此准确判定是“缺少按 Provider 的模型映射，常见跨模型降级未完成”，并非完全没有降级代码。

验收要求：策略明确绑定每个候选的模型和必要参数；注入超时、429、5xx，验证备用确实产出结果并记录切换。

### F11 · P2：设置页新成员邀请漏写所属用户

[SettingsServiceImpl.createMember](D:/Programs/AetherFlow/backend/auth-service/src/main/java/com/aetherflow/auth/settings/service/impl/SettingsServiceImpl.java:107) 新实体未设置 ownerUserId，[数据库字段](D:/Programs/AetherFlow/docker/mysql/init/01-aetherflow.sql:58) 为 NOT NULL。按当前 schema，新成员插入失败；若历史 schema 允许空，后续按 owner 过滤的列表也查不到该行。

这属于用户追加的企业产品完整性要求，不是把开题报告里的“用户管理”擅自解释成已经承诺完整团队协作。需另外核实“邀请”是否包含实际接受/授权流程，不能把一条成员记录等同于团队权限闭环。

### F12 · P1：恢复器拿到锁后仍使用旧快照，重复执行已完成节点

[恢复扫描](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/recovery/WorkflowRuntimeRecoveryService.java:68) 先读整批快照，再逐一加锁恢复。[resumeLocked](D:/Programs/AetherFlow/backend/workflow-service/src/main/java/com/aetherflow/workflow/runtime/engine/WorkflowRuntimeEngine.java:207) 直接拿传入的旧快照建状态、保存并继续，没有锁内重读最新记录。

触发不要求锁失效：扫描读到 RUNNING 后，原运行器完成 A、把 B 保存为 WAITING 并释放锁；恢复器随后拿到锁，仍用“A 未完成”的旧快照，重新执行 A。可能覆盖最新输出、重复调用外部系统；AI 局部任务幂等不能保护所有节点副作用。

已复现：把仓库最新快照设置为 WAITING 且 done 节点完成，向真实引擎传入旧 RUNNING 快照，done 再次执行，最新快照读取次数为 0。根审查再次运行同一独立 harness 确认结果。

验收要求：恢复在锁内读当前权威状态，再判断是否仍需恢复；覆盖扫描、正常完成、异步回调交错。此项应与 F01 一起优先修复。

### F13 · P2：运行详情未接入实际节点输出和产物列表

[运行映射](D:/Programs/AetherFlow/frontend/src/services/api/runApi.ts:112) 的 output 取事件名/状态；同文件第 166–167 行把 artifactCount、artifactNames 固定为 0 和空数组。运行页因此不能完整呈现“这次运行产生了什么”，也没有对应产物下载入口。

独立文件页面确有授权下载，不能说结果下载完全没做。准确缺口是文档 P060/P064 的运行结果查看闭环未完成，用户需去文件列表另找输出；普通 LLM/OCR 结果还需显式 Export 才成为文件资产。

验收要求：RunView 提供真实节点结果和本次产物关联，页面能定位/查看/下载；大输出分页或引用化，避免直接塞入事件流。

### F14 · P1：历史运行列表与认证指标存在随数据增长放大的访问成本

- [listRuns](D:/Programs/AetherFlow/frontend/src/services/api/runApi.ts:305) 一次页面加载循环拉最多 1000 页，每页 50 条；后端对每条运行另外查最多 2000 条事件。1 万历史运行可形成约 200 次分页请求和 1 万次事件查询。这是代码可推导的请求数量，未实测耗时。
- [AuthSessionService.metrics](D:/Programs/AetherFlow/backend/auth-service/src/main/java/com/aetherflow/auth/session/AuthSessionService.java:89) 每次执行两次 Redis KEYS，再逐条读取登录失败计数；普通登录用户可访问相应指标入口。随着 key 总量增大，这会与认证、黑名单、锁共用 Redis 资源。

验收要求：运行列表保留真实分页、返回轻量摘要；详细事件按需读取；指标用聚合计数/受控后台采集，移除在线请求的整库 KEYS。需覆盖长期有大量历史数据的场景，不能只压空数据库。

### F15 · P1：Whisper readiness 与真实模型状态不一致

[readiness helper](D:/Programs/AetherFlow/python-ai-service/app/main.py:1461) 仅检查 faster_whisper 能否 import；模型初始化失败时 _whisper_model=None，但 /ai/status 仍可能返回 whisperRuntimeReady=true。真正转录入口则直接返回“模型未加载”。

执行当前函数的轻量核验得到“model=None，ready=True”。这违反项目“以真实运行能力快照预检”的契约。

验收要求：readiness 依据已加载可服务的模型实例及必要依赖；故意制造模型下载/加载失败时，前后端一致判不可执行；模型恢复后正确更新。

### F16 · P1：Whisper 预处理阻塞共享 Python 事件循环

[async transcribe](D:/Programs/AetherFlow/python-ai-service/app/main.py:448) 在首次 await 之前同步下载文件、同步调用 FFmpeg。仅推理被送到线程；默认 Docker 单 worker 会让其他请求的接收和调度一同等待。

执行当前函数、注入 300ms 同步下载后，旁路 10ms 定时器实际约 313ms 才执行。这只证明调度阻塞，不是生产性能数据。

验收要求：下载/转换/推理全过程使用受限的异步/工作线程或进程执行，有共享截止时间和可回收资源；一个慢视频不拖住健康检查和其他模型请求。

### F17 · P1：重媒体产物仍以完整 Base64 在多服务之间反复传递

文档 P067 明确提出通过文件标识传递，避免服务间直接传输大文件。但 Python FFmpeg 将最多 50 MiB 输出 read_bytes 后 Base64 放进 HTTP 响应，Java 反序列化、解码，登记时再次编码；图像也走相似内存路径。

这是实际实现与文档目标的差距，不是文件处理过程中必要的“从对象存储下载原文件”。多任务并行时，中间字符串/字节数组和请求体会放大堆内存与传输压力。证据链、50 MiB/图像边界见 [AI 分项报告](D:/Programs/AetherFlow/summary/audit-2026-09-12-ai-features.md)。

验收要求：Runtime 将大产物写入受控对象存储，服务间传递引用和元数据，以可重试登记/清理保证一致性；用真实大小及并发验证峰值内存。

### 其他功能完整性与企业边界

以下仍属于本次审查结果，不能因为已列出主要问题而忽略。分项报告包含逐条源码位置：

| 差距 | 判定与证据范围 | 修复验收 |
|---|---|---|
| 成员角色只维护记录，未连工作区真实授权 | 成员表不关联目标用户/工作区；设置的角色/移除不会改变目标用户的工作区访问。企业团队协作未完成，报告并未单独承诺该功能 | 邀请接受、绑定用户、授权/撤销和跨角色测试形成闭环 |
| 工作区默认超时、保留天数仅 CRUD | 搜索消费方仅见 DTO/实体/保存展示，运行器/保留作业不使用这些字段；平台级固定超时确实存在 | 用户修改后相应任务与清理策略真正生效，或页面明确不可配置 |
| Provider status 返回全局日志 | /logs 限管理员，/status 却包含同源 recent logs 与全局 metrics，普通用户可读跨用户模型/错误元数据；未证明包含完整 prompt/API Key | 平台运维状态与个人状态分开，统一接口权限与租户过滤 |
| 知识摄取快路径绕过 Spring 事务 | afterCommit lambda 同实例调用带 @Transactional 方法，和扫描器代理调用原子性不同 | 同一事务入口/短事务发布，注入分片写入后失败并核对回滚/对账 |
| Qdrant 分支漏 document.ready 检查 | 并发 A 成功将数据集置 ready、B 仍摄取但已写 ready 分片时，可能读到 B 的中间片段；源码路径确定，整链并发暴露尚待复测 | 双任务屏障测试，检索只返回 ready 数据集/文档/分片 |
| OCR 混合 PDF 和输出上限 | 只要整份 PDF 有任意文本层即返回文本，不补 OCR 扫描页；OCR 分支缺统一字符上限。静态核验，未跑真实混合文件 | 混合页面提取完整性、全部 Provider 共用输入/输出限额 |
| 图像切换/恢复与长期日志 | 图像切换主要应用日志；LLM 推理日志是最近 200 条全局 Redis 窗口，未形成长期按租户审计 | 按任务/用户关联事件，有保留和可检索策略 |
| 独立 Embedding 与知识库摄取未串通 | 独立节点写另一向量集合，不自动创建平台知识数据集；平台知识库导入本身已实现 | 明确节点能力边界，或补齐标准知识入库节点和资产关联 |
| 多维数 Embedding 模型共用集合受限 | 知识索引固定单集合维数，换不同维数模型会失败 | 模型版本/维数隔离、迁移及兼容验证 |
| 取消不能保证在途工作停下 | 已有 CANCELLED 状态及晚到结果防回写；跨服务取消失败只记日志，在途同步调用缺统一终止/补偿 | 运行中取消、取消传播失败、并行节点失败后资源及时回收 |

来源：[产品与安全分项](D:/Programs/AetherFlow/summary/audit-2026-09-12-product-security.md)；
[运行时分项](D:/Programs/AetherFlow/summary/audit-2026-09-12-runtime.md)；
[AI/知识库/文件分项](D:/Programs/AetherFlow/summary/audit-2026-09-12-ai-features.md)。

## 4. 企业级目标尚缺的交付与验证

### E01：性能门禁可能给出错误的业务成功结论

JMeter 计划只测状态接口、文件操作、模板转换流程的创建/启动；通用断言主要检查 HTTP/Result code。**没有等待工作流终态，没有检查 AI 结果，没有覆盖真正推理负载。**

因此 F01 那种“创建 PENDING 但永不执行”的服务仍可能通过现有门禁。[当前 JMeter 流程](D:/Programs/AetherFlow/performance-test/aetherflow-core-api.jmx:394)；[容量门禁脚本](D:/Programs/AetherFlow/scripts/aetherflow-capacity-gate.ps1:33)。

需要分别测提交吞吐、排队时间、执行完成吞吐和端到端耗时；用“启动接口很快”不能证明后台处理能力。

### E02：没有足以支持“大并发、极强稳定性”的当前版本证据

现有结果目录中的 JTL 是 2026-05/06 历史诊断材料，其中两个 load-check 只有表头。本次未找到当前工作区对应的 capacity-evidence.json、真实长时间混合负载报告及故障演练结果。

生产验收至少需要明确：硬件/副本/模型/文件大小/活跃租户；阶梯和突发负载；持续稳定运行；P95/P99、错误率、积压与排空时间；CPU/内存/GC/连接池/MQ/GPU 指标；杀副本、依赖超时、网络中断后的恢复与不重复副作用。

这里的结论是“未证明容量”，不是推测一个一定会崩溃的并发数字。当前无法负责任地承诺 QPS、并发人数或可用性百分比。

### E03：Swarm 的外部依赖配置和运行保障仍未闭环

按模板填写外部 RABBITMQ_HOST 并不会同步更新 Task 的管理 API 默认地址；监控失败又采用 fail-closed，会拒绝提交。Python 配置 Redis 也默认写死 redis，未继承外部 REDIS_HOST；Java prod 使用 Redis TLS，Python host/port 构造则未启用 TLS，需要显式正确配置 URL 等。

Python 在 Compose 有健康检查，但 Dockerfile 与 Swarm 服务没有；静态 Prometheus 目标未证明覆盖每个副本。完整证据与触发条件见 [部署与容量分项报告](D:/Programs/AetherFlow/summary/audit-2026-09-12-deployment-capacity.md)。不能把本地 Compose 成功等同于外部 HA 集群可用。

### E04：备份工具存在，业务灾备验收未完成

当前脚本备份 MySQL、Redis、MinIO，不包含 Qdrant 向量快照或完整重建验收；没有本版本跨存储恢复、RPO/RTO 实测。Redis 已启用 AOF，恢复脚本只覆盖 RDB，需验证恢复加载的实际数据。[备份脚本](D:/Programs/AetherFlow/scripts/aetherflow-backup.ps1:23)；[恢复脚本](D:/Programs/AetherFlow/scripts/aetherflow-restore.ps1:31)。

企业要求是“恢复之后用户、文件、知识库、工作流及未完成任务正确”，不能只验证文件有备份和命令退出码为 0。

## 5. 本次验证结果及局限

| 检查 | 本次结果 | 能证明什么 |
|---|---|---|
| Maven 全量 mvn test -B | 206 suite，734 用例，0 失败/错误/跳过；租约 CAS 追加后 workflow-service -am 353 用例通过 | 当前 Java 测试通过，不能覆盖未编写的真实数据库/网关场景 |
| 前端 npm test | 48 文件，173 用例通过 | 现有组件/逻辑测试通过 |
| 前端 npm run build | 通过 | 类型检查与生产资源构建成功 |
| 14 项 check:* | 全部通过 | 节点映射、编辑器、配置等已有静态/契约断言成立 |
| Python 正式服务 | 25 passed | 现有 Python 测试通过 |
| 独立 ai-runtime | 4 passed | 独立运行时现有测试通过 |
| 两个 Python venv pip check | 通过 | 当前环境依赖关系无报告的破损 |
| 性能阈值正反例 | 通过 | 门禁可以接受好样本、拒绝坏样本；不是容量成绩 |
| JMeter 契约测试 | mock gateway 通过 | JMeter 计划和 Result 断言可运行；不证明真实 MQ/AI |
| Compose -ConfigOnly | 25 服务配置通过 | Compose 配置可解析且包含检查要求的服务 |
| Docker 真实部署 | 已执行 | Docker Desktop Linux Engine 29.4.1；当前源码 Compose 镜像启动后 25 服务配置通过，关键服务 healthy，真实部署门禁通过 |
| 独立缺陷复现 | F01、F03、F12 Java harness 复现；F08 真实 ffmpeg；F15/F16 当前 Python 函数核验 | 明确证明现有回归仍遗漏实质问题；没有冒充真实集群测试 |

[验证日志目录说明](D:/Programs/AetherFlow/summary/audit-2026-09-12-validation/README.md)；
[Java 统计](D:/Programs/AetherFlow/summary/audit-2026-09-12-validation/java-summary.json)。
首次 Maven 调用因 PowerShell 拆分可选 -D 参数失败，随后去掉该参数重跑成功；该调用错误不计为项目测试失败。

旧报告中“没有独立 FFmpeg”“没有真正图像 Provider”“没有 Java 健康检查”“Alertmanager 永远空接收器”“CI 不跑前端/Python 测试”等结论，已不适用于眼前代码。应保留这些已有成果，集中修复当前缺陷。

## 6. 整改与验收顺序

1. **先恢复正常使用并封住数据破坏入口**：F01 启动、F02 登录、F03 推送、F04 导出隔离；增加真实网关/MySQL/MinIO 的最小端到端回归。
2. **再稳定状态与数据生命周期**：补齐取消传播失败后的持久补偿、F13 运行产物关联和 F17 大媒体引用化；覆盖重试、取消、崩溃、重复/乱序事件。
3. **补齐已公开能力的可用性并移除明显放大路径**：F08 格式、F10 跨 Provider 模型、F11/F13 成员与结果、F14 历史查询、F15/F16 AI 健康与调度、F17 大产物引用化，以及分项报告中的组合/事务边界。
4. **完成生产部署和运维闭环**：真实外部依赖、所有副本健康检测、逐实例指标、实际告警送达、完整数据恢复。
5. **最后量化容量**：固定同一源码/镜像/配置/硬件，运行真实 AI 与文件混合负载、持续测试和故障演练，再确定并发上限、限流阈值、SLO 和发布门禁。

验收目标是“关键流程可用、错误行为受控、数据不越权不丢失、故障能恢复、容量有实测依据”。现阶段继续增加页面或中间件数量，不会替代这些工作。
