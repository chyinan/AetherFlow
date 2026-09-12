# AI、知识库与文件承诺核对（2026-09-12）

审计对象：当前工作树（包含用户已有的未提交修改），对照 `summary/thesis-promises-2026-09-12.txt` 的 P050–P061、P065–P073。只读业务源码；没有替换业务实现、发布服务或调用付费模型。本报告的完整命令和轻量核验输出直接保存在本文末尾，没有额外测试产物。根代理负责 Java/前端/Python 整体回归与部署证据。

结论：8 类节点均已有真实实现入口，不能认定 FFmpeg、Whisper、OCR、Embedding、图像生成等“完全没做”。但正常格式转换、跨 Provider 降级、知识库追加文档后的可用性存在可定位的功能缺陷；知识摄取一致性、向量索引生命周期、Python 并发隔离尚不足以据此认定企业级稳定可用。默认关闭且需要部署外部模型的能力，必须与“没有实现”分开。

## 1. 文档承诺与当前状态矩阵

| 文档承诺 | 当前实现状态 | 当前代码证据 | 限制 / 未完成环节 | 已部署验证 |
| --- | --- | --- | --- | --- |
| P053 文件输入 | 已实现 | `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/UploadNodeExecutor.java:42` 按 userId/fileId 取元数据；48–55 传递文件变量；`backend/file-service/src/main/java/com/aetherflow/file/service/impl/FileInfoServiceImpl.java:137` 上传、196 下载并校验所有者 | 真实链路需要 File Service、MinIO。不能从代码存在推断大文件并发容量 | 本子审计没有部署实测 |
| P054 独立 FFmpeg 节点 | 已实现，但部分格式实际失败 | `WorkflowNodeCatalogService.java:139` 独立 FFMPEG；`FfmpegWorkflowNodeExecutor.java:24` → AI `FfmpegNodeExecutor.java:31` → `python-ai-service/app/main.py:578`；`AiWorkflowNodeResultAdapter.java:31` 将产物转为通用 fileId/fileUrl 给下一节点 | m4a/aac 被错误作为 FFmpeg muxer 名，两种选项运行必失败；timeoutSeconds 在 Java AI executor 丢失；50 MiB 结果以 Base64 跨服务传输 | 本机真实 FFmpeg 轻量核验确认 m4a/aac 失败、wav 成功；未做部署端到端 |
| P055 Whisper + 时间信息 | 已实现，默认部署关闭 | `python-ai-service/app/main.py:487` 调用 faster-whisper，493/497 输出 SRT；1408–1414 用 segment.start/end 构造时间戳；AI `AsrNodeExecutor.java:44` 将 SRT 登记产物 | Compose 默认 ENABLE_WHISPER=false；启用后需要模型成功加载；运行时 ready 探测不能判断模型加载失败；同步预处理会阻塞事件循环 | 无真实语音模型推理实测 |
| P056 OpenAI/Ollama LLM、总结翻译与参数 | 已实现，默认 Python LLM 关闭 | AI `workflow/executor/LlmNodeExecutor.java:33`、`SummaryNodeExecutor.java:54`、`TranslateNodeExecutor.java:53`；`provider/PythonRuntimeAiProvider.java:132`；Python `main.py:503`、828、867 | 外部账号/模型与 ENABLE_LLM 必须配置；常规 OpenAI→Ollama 自动降级保留原模型名，导致备用模型不可执行，见 F01 | 无真实 OpenAI/Ollama 故障切换实测 |
| P057 图片、扫描文档 OCR | 已实现，存在完整性边界 | `document/DocumentContentExtractionService.java:42` 图片走 Tesseract、文本走 Tika、全空文本回退 OCR；`ocr/provider/TesseractOCRProvider.java:74` 真正调用 Tess4J | 混合 PDF 只要有任何文本层就跳过全部扫描页 OCR；OCR 分支没有 Tika 的 100 万字符输出上限；生产需要 native 库和语言数据 | 没有真实扫描件部署 OCR 实测 |
| P058 Embedding/语义检索/RAG基础 | 已实现，知识库仍有一致性缺陷 | `EmbeddingNodeExecutor.java:64` 分片、真实 Provider、保存向量；Ollama Provider 通过 Spring AI EmbeddingClient 调用模型；`KnowledgeRetrievalNodeExecutor.java:45` 调用知识检索；`KnowledgeServiceImpl.java:845` Qdrant 检索路径 | 只承诺 Ollama 是准确的。独立 EMBEDDING 节点写工作流向量集合，不会自动创建知识数据集/文档；检索节点读取知识库数据集，需要走独立知识库摄取。生产需外部 Qdrant；有 F02/F05/F06 | 无真实 Qdrant/模型规模和故障注入实测 |
| P059 Stable Diffusion、ComfyUI图像 | 已实现，默认关闭，需外部部署 | `image/StableDiffusionWebUiProvider.java:65` 调 `/sdapi/v1/txt2img`/img2img；`ComfyUiProvider.java:108` `/prompt`→历史轮询→下载；`ImageGenerationAiNodeExecutor.java:119` 构建真实文件产物 | 两 Provider 均默认 disabled；探活只是 API 可达，不能证明 checkpoint/显存/图像质量；图像 failover 有循环和日志，但没有接入 LLM 同等的持久切换/恢复事件链 | 无真实图像生成实测 |
| P060 输出查看/下载 | 已实现，有明确格式范围 | `ExportNodeExecutor.java:53` 上传 MinIO 并注册元数据；247–249 仅 Markdown/TXT/JSON；AI产物由 `AiFileRegistrationService.java:32` 登记 | 文档/文本不是自动每个节点都生成可下载文件，需要显式 EXPORT；没有 DOCX/PDF 导出执行器证据，文档本身未明确承诺这些格式；EXPORT允许用户配置共享对象键，有安全缺陷，交主审计合并 | 无浏览器下载端到端实测 |

Java 表中未写全路径的节点文件均位于 `backend/workflow-service/src/main/java/com/aetherflow/workflow/node/executor/`；AI 文件位于 `backend/ai-service/src/main/java/com/aetherflow/ai/`。知识库文件位于 `backend/workflow-service/src/main/java/com/aetherflow/workflow/knowledge/`。

| P071–P073 Provider管理承诺 | 状态 | 证据 / 缺口 |
| --- | --- | --- |
| 用户设置 Provider 优先级/策略 | 已实现 | `provider/ProviderRoutingPolicyService.java:27` 按用户读取，51 按用户保存；`ProviderRoutingPolicy.java:29` LLM优先级、32图像优先级；Controller `/policy/user` |
| LLM超时、重试、熔断、降级 | 框架已实现，跨模型降级不完整 | `AiProviderRouter.java:129–230` 有顺序调用/重试/熔断/事件；但 F01 的模型映射缺失 |
| LLM切换与恢复记录 | 已实现基础记录，审计留存不足 | Router 191写FAILOVER；`ProviderHealthCheckService.java:106` AUTO_RECOVERY；`ProviderRecoveryService.java:26` MANUAL_RECOVERY；`RedisAIInferenceLogService.java:18–30` 仅一个最近200条Redis列表，不能视为可追溯的长期企业审计记录 |
| 图像优先级与降级 | 部分实现 | `ImageGenerationAiNodeExecutor.java:59–91` 按策略尝试可用Provider；只 log.info/log.warn，没有写入上述 AIInferenceLogService，没有图像恢复探测事件 |
| 配置后即代表可用 | 不成立 | Compose 222–223 与 .env.example 75–76 默认关闭 Whisper/LLM；AI application-prod.yml 64/67 图像默认关闭。模型下载、外部服务和凭据均要另行验证；Whisper还存在F04错误ready |

## 2. 已确认的功能和可靠性问题

### F01 / P1：跨 Provider 自动降级不会切换模型，常规 OpenAI→Ollama 备用失效

- 对应 P072–P073。`backend/ai-service/src/main/java/com/aetherflow/ai/provider/AiProviderRequest.java:39–40` 的 withProvider 仅替换 provider，保留 model。`AiProviderRouter.java:176–178` 直接使用它；`PythonRuntimeAiProvider.java:132–138` 把原 model 发给 Python；`python-ai-service/app/main.py:867` 原样传给 Ollama generate。
- 最小触发：工作流选择 OpenAI 的 gpt-* 模型，启用降级到只部署了 llama/qwen 的 Ollama；OpenAI发生超时/限流。路由改为OLLAMA，但仍请求gpt-*，备用返回模型不存在，流程失败。
- 优先级配置和重试框架确实存在；缺的是“每个候选 Provider 对应的可执行模型/参数映射”及相应预检。只有多个后端恰好暴露同一模型名的特例可能成功。
- 证据等级：完整源码链确认，尚未连接两个真实Provider做故障切换。

### F02 / P1：追加文件失败或取消，会让已有知识库长期不能检索

- 对应 P058、P064 企业可用性。`knowledge/mapper/KnowledgeDatasetMapper.java:68–76` 的 startIngestion 把整个数据集设为processing；`49–66` 的 failIngestion/cancelIngestion只减计数，不恢复status。
- `knowledge/service/impl/KnowledgeServiceImpl.java:431` 启动摄取；1449 失败时调用failIngestion，569删除处理中任务调用cancelIngestion；611–612 的检索入口拒绝非ready数据集。
- 最小触发：已有ready文档的数据集新增一个文件，最终三次失败，或删除该processing文档；此后无其他成功摄取。已有可用文档仍在数据库，dataset却留在processing，查询和引用它的工作流持续失败。新增任务正在处理期间也会暂时使整个数据集不可检索。
- 修复目标：摄取状态与数据集服务状态分开；失败/取消必须重算可服务状态，检索继续只取ready文档。
- 证据等级：SQL更新与入口门禁静态闭环确认；未在外部数据库写入测试数据。

### F03 / P1：Whisper预处理阻塞Python单worker事件循环

- `python-ai-service/app/main.py:448` 是async处理器，却在458–459直接同步下载、同步调用FFmpeg，直到472–475才把推理转线程并await。
- 下载实现 `1334–1368` 用同步httpx.stream与文件写入；视频音轨提取 `1398–1403` 用subprocess.run，默认120秒。默认镜像启动 `python-ai-service/Dockerfile:23` 未设置多worker。
- 最小触发：一次较慢的视频下载或音轨转换。此时同进程的LLM异步调用、转录、HTTP请求接收都会受阻；Whisper并发Semaphore只限制数量，不能隔离事件循环。推理超时计时在预处理之后才开始。
- 已用当前transcribe函数AST做轻量行为核验：模拟300ms下载，原本10ms旁路计时器实际313ms后才执行。该结果证明函数调度阻塞，不代表线上时延基准。
- 修复目标：下载/转换一并异步化或移入受限worker，整个请求共享deadline；耗时原生进程应可超时终止。

### F04 / P1：Whisper模型加载失败仍宣称运行时ready，预检依据失真

- `python-ai-service/app/main.py:63–71` 模型初始化异常会把 `_whisper_model=None`；`1461–1467` `_whisper_runtime_ready()`只检查是否能import faster_whisper。
- `/ai/status` 在423以此填whisperRuntimeReady。Java `provider/ProviderRuntimeCatalogMapper.java:25–27`直接采信，`capability/AiWorkflowCapabilityEvaluator.java:30–33`据此判断Whisper可执行。真实转录入口453–454则因model=None返回503。
- 最小触发：依赖已安装、ENABLE_WHISPER=true，但模型文件缺失、下载失败或加载失败。此时能力目录/预检可以认为可运行，提交后却必失败。不是“没安装Whisper”，而是健康契约未检验真正模型实例。
- 轻量执行当前helper，模型对象为None时返回True，见末尾命令。需进一步部署注入模型加载失败，验证完整预检响应与UI状态。

### F05 / P1：删除知识文档不清Qdrant向量，累计孤儿可吞掉全部检索候选

- `KnowledgeServiceImpl.java:556–574` 删除作业、MySQL分片与文档，但没有调用向量文档删除。`knowledge/vector/KnowledgeVectorIndex.java` 与 `QdrantKnowledgeVectorIndex.java`只有deleteDataset，没有deleteDocument。
- Qdrant search在 `QdrantKnowledgeVectorIndex.java:105–125` 只按datasetId/部分metadata过滤并限定候选数；`KnowledgeServiceImpl.java:854–856`仅请求max(50,topK*20)上限候选，随后924–940删去MySQL找不到的ID，不补足后续有效候选。
- 最小触发：同一数据集先导入并删除与查询高度相似的足量分片（topK=3时60条即可占满候选），另保留较低相似度但合法的ready文档。Qdrant返回旧ID，SQL全部过滤后返回空/少量结果；实际有效文档被截断，且向量存储一直增长。
- 摄取失败回收MySQL分片（1442）也未同步删除已写Qdrant向量，会产生相同污染。重建入口是逐条upsert，不是可靠删除重建。
- 证据等级：删除与检索源码静态闭环确认；需真实Qdrant夹具复测召回受损程度。

### F06 / P1候选：知识摄取快速路径绕过事务，结合并发完成可暴露未ready文档片段

- 明确可确认的缺陷：`KnowledgeServiceImpl.java:435` 注册afterCommit，1399提交lambda→1416私有processClaimedJob→1422同实例直接调用processQueuedDocument；绕过489的Spring `@Transactional` 代理。定时扫描 `KnowledgeIngestionJobRunner.java:57` 从注入knowledgeService代理调用，才有事务。两条生产路径的原子性不同。
- `KnowledgeServiceImpl.java:1062–1070` 先把chunk设ready、插入MySQL，再逐片写Qdrant，最后536–544才将文档、计数、作业改为成功。快速路径可能先提交部分分片，再发生后续异常或租约丢失；抛异常不能把此前自主提交的写入整体回滚。
- **暴露processing文档分片需要并发条件，不是每次摄取都会发生**：同一dataset有A、B两项摄取；A成功时 `KnowledgeDatasetMapper.java:36–43` 无条件把dataset设ready，即使B仍处理中。B走上述快速路径并提交至少一个ready chunk/Qdrant point但尚未更新document.status。此窗口查询通过dataset.ready门禁；`KnowledgeServiceImpl.java:924–939` Qdrant分支只检查chunk.ready/datasetId，缺少document.ready校验；对照SQL路径985–988有EXISTS文档ready限制。
- 最小复测建议：使用真实Spring容器+MySQL+Qdrant，给B第二次upsert设置屏障；完成A，查询B第一片内容，应验证“不返回B”。随后让B失去租约，再检查是否遗留MySQL分片和计数。
- 证据等级：事务自调用和过滤缺口源码确认；跨并发的最小触发序列是静态推导，**尚未完成整链故障注入，应列进一步复测，不能写成已部署复现的数据泄漏事件**。即使尚不暴露片段，快速路径无法保证整体回滚也应修正。

### F07 / P2：FFmpeg允许的m4a/aac输出格式实际必失败，超时配置还被丢弃

- `WorkflowNodeCatalogService.java:149`允许wav/mp3/m4a/aac/mp4；`python-ai-service/app/main.py:582`同样允许。602执行 `command.extend(["-f", output_format, str(output)])`，错误把m4a/aac当作muxer；应使用如ipod/mp4、adts或让FFmpeg按目标扩展名推断。
- 本机真实FFmpeg执行结果：m4a、aac均 `Requested output format ... is not known`，wav退出0。实际Python处理器捕获CalledProcessError在608返回502，正常用户选项会被当成服务失败。
- 附加：Workflow `FfmpegWorkflowNodeExecutor.java:34–35`设置timeoutSeconds，但AI `FfmpegNodeExecutor.java:36–40`构造DTO只设置fileUrl/operation/outputFormat，未转发timeoutSeconds，配置超时不会到Python。

### F08 / P2：混合PDF会静默漏掉扫描页，OCR输出限制不完整

- `document/DocumentTextExtractionService.java:82`明确禁用Tika OCR；`DocumentContentExtractionService.java:50–55`只要Tika抽出任意非空文本，就返回，不再对扫描页面OCR。`TesseractOCRProvider.java:112–123`也按整份PDF是否存在文本层短路。
- 最小触发：一份PDF首页有文本层、第二页只有扫描图片。结果只含首页，却显示成功，不能覆盖“扫描文档识别”的常见混合文件场景。
- Tika `DocumentTextExtractionService.java:45–54`强制maxExtractedCharacters；Tesseract `74–104`直接返回所有OCR文字，DocumentContentExtractionService的fromOcr也没有同等长度检查。100万字符合同只在文本分支闭合。
- 证据等级：静态确认；未进行真实混合PDF/超长OCR结果端到端核验。

### F09 / P1：EXPORT可指定共享对象键造成覆盖（已交主审计安全维度合并）

- `WorkflowNodeCatalogService.java:613`主动提供objectKey配置。`ExportNodeExecutor.java:182–185`原样接受自定义对象键；53–71先MinIO put覆盖，再登记元数据；失败时直接remove。
- `FileInfoServiceImpl.java:301–329`元数据登记仅使用调用用户为新记录owner，没有校验该bucket/objectKey此前所属者。
- 拥有合法工作流编辑权限的用户可以选择另一个对象的键或共享键，覆盖内容后以自己的新metadata读取；登记超时后的补偿删除也可删除实际已登记对象。主审计安全代理已交叉确认，避免在最终报告重复计数。

## 3. 与“企业级完整产品”目标的其他差距

- **产物统一管理是部分闭合。** SRT、图像和FFmpeg产物走文件登记；SUMMARY/TRANSLATE/LLM返回AiNodeResult时artifacts=List.of()，OCR只输出变量。没有EXPORT节点时，分析文本只是运行记录数据，不是统一文件资产；文档P067应说明“需输出节点持久化”，或者补齐自动产物策略。
- **P067大文件跨服务传输的目标尚未兑现。** FFmpeg将最多50MiB文件完整read_bytes/Base64（Python620），AI REST完整反序列化、Base64解码（PythonMediaClient35）、executor再解码（FfmpegNodeExecutor41），文件登记重新Base64编码（AiFileRegistrationService82）。图像也走相似链，最多8张、每张20MiB。限流和最终对象存储存在，但链路仍有数倍内存与HTTP体放大。应改为Runtime直写暂存对象、传引用、确认入库，而非仅增加堆内存。
- **知识摄取成本串行且跨网络。** `KnowledgeServiceImpl.java:1198`逐片调用Embedding，`QdrantKnowledgeVectorIndex.java:50/66`每片先检查collection再单点upsert。scanner事务从489覆盖整个下载/提取/Embedding/Qdrant过程；长事务占用连接，API同步createDocument也有同样外部调用在事务内。需要batch与短事务发布，不应据线程池存在认定高并发能力。
- **不同维数Embedding模型共享唯一知识集合。** `QdrantKnowledgeVectorIndex.java:231–233`统一 `${collection}-knowledge`；首次创建固定dimension（164），后续184–185拒绝不同dimension。数据集模型可选，但不同模型维数不能共存于当前一个知识集合，需要按模型版本/维数规划集合。
- **独立Embedding与知识库摄取不是同一条产品流程。** 独立节点写`QdrantVectorStore.java:56`所选vectorCollection；知识检索读取knowledge dataset + `${collection}-knowledge`。未找到将该节点向量直接登记进知识数据集的执行链；不能宣传“连接Embedding节点就自动完成平台知识库入库”。手工/文件知识库导入功能确实已实现。
- **图像切换记录和恢复只做到应用日志级别。** 图像executor 75–87只写日志；LLM最近200条事件窗口也不能替代长期、按租户/任务可检索的审计与故障恢复证据。

## 4. 轻量验证命令与结果（输出保存于本文）

### 4.1 FFmpeg真实muxer检查

在仓库根目录执行，无输入/输出媒体文件落盘：

```powershell
rtk proxy python -X utf8 -c "import subprocess; [(print('FORMAT',fmt),print((lambda p: 'exit='+str(p.returncode)+' '+p.stderr.decode(errors='replace'))(subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','0.01','-f',fmt,'-'],capture_output=True)))) for fmt in ['m4a','aac','wav']]"
```

输出（去除FFmpeg地址值，无内容删改）：

```text
FORMAT m4a
exit=4294967274 Requested output format 'm4a' is not known.
Error initializing the muxer for pipe:: Invalid argument
FORMAT aac
exit=4294967274 Requested output format 'aac' is not known.
Error initializing the muxer for pipe:: Invalid argument
FORMAT wav
exit=0
```

### 4.2 执行当前Python函数验证ready与事件循环

使用当前源码AST提取原函数，仅清除装饰器/类型注解并替换外部依赖；没有改写函数体、业务文件、或启动真实模型。以下Python程序通过 `rtk proxy python -X utf8 -c "..."` 执行（双引号包围整个多行程序）：

```python
import ast, asyncio, os, sys, threading, time, types
from pathlib import Path
source = Path('python-ai-service/app/main.py').read_text(encoding='utf-8')
tree = ast.parse(source)
nodes = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
         and n.name in ['_whisper_runtime_ready', 'transcribe']]
for n in nodes:
    n.decorator_list = []
    n.returns = None
    for a in n.args.args:
        a.annotation = None
sys.modules['faster_whisper'] = types.SimpleNamespace(WhisperModel=object)
ns = {'asyncio': asyncio, 'os': os, '_whisper_model': None,
      '_enabled': lambda _: True, '_whisper_slots': threading.BoundedSemaphore(2),
      'logger': types.SimpleNamespace(info=lambda *a: None, warning=lambda *a: None)}
exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
             'current-main-ast', 'exec'), ns)
print('readiness_probe_when_model_none:', ns['_whisper_runtime_ready'](),
      '; actual model:', ns['_whisper_model'])
ns['_whisper_model'] = object()
ns['_materialize_source'] = lambda _: (time.sleep(.30) or Path('in-memory-fixture.wav'))
ns['_ensure_audio_source'] = lambda p: p
ns['_cleanup_materialized'] = lambda *a: None
ns['_transcribe_blocking'] = lambda *a: 'transcribed'
class FakeHttpError(Exception):
    pass
ns['HTTPException'] = FakeHttpError
async def test():
    origin = time.monotonic()
    async def sibling():
        await asyncio.sleep(.01)
        return time.monotonic() - origin
    result = await asyncio.gather(
        ns['transcribe'](types.SimpleNamespace(fileUrl='fixture', language='auto')), sibling())
    print('sibling_10ms_timer_actual_seconds:', round(result[1], 3),
          '; transcribe_result:', result[0])
asyncio.run(test())
```

实际输出：

```text
readiness_probe_when_model_none: True ; actual model: None
sibling_10ms_timer_actual_seconds: 0.313 ; transcribe_result: transcribed
```

这些是确定性功能/调度核验，不是生产压测或真实Provider可用性证明。F02/F05/F06的并发、数据库与向量索引故障注入，以及真实OCR/Whisper/图像生成，应作为后续验收项。
