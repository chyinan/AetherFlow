# 自定义 API 模板与 Python 节点扩展

## 范围与使用

节点面板或画布添加菜单中的「自定义节点 · API / 代码」打开模板库。

1. 新建 API 或代码模板，填写稳定 ID、`x.y.z` 版本、名称、说明。
2. 可视化声明输入、配置表单、输出的名称、类型、必填性与默认值。字符串字段支持枚举。输出用 JSON Pointer 指定响应位置，空路径代表整个结果。
3. API 模板配置方法、URL、请求头 JSON、请求体 JSON。代码模板编写 Python `main(payload)`，返回 JSON。
4. 保存后从「自定义」分类添加节点。检查器中配置固定输入、工作流变量绑定和表单参数。输出直接作为已声明的工作流变量供下游选择。
5. 在检查器「调试预览」提供模拟变量和响应，检查输入、请求替换、输出映射。本地预览**不发送请求、不执行 Python**；请求头值隐藏。实际调用使用正常工作流执行和日志入口。

模板库保存于**当前浏览器当前站点**的 localStorage，最多 128 个版本；清除站点数据会移除库。JSON 模板包可下载、复制或从文件导入，最多 1 MiB。库读取失败时保留原数据、阻止普通保存，并提供读取原数据及显式导入恢复入口；恢复前应备份原数据。库不是账户同步存储，不新增身份、租户或文件访问组件。

同源新版窗口使用 Web Locks 独占写入锁，在锁内比较加载时的完整库快照、重新校验同版本内容并递增 `libraryRevision` 后保存，不使用普通 localStorage 读后写模拟互斥。其他窗口写入会通过 storage 事件同步列表，编辑草稿保留。若保存或删除的快照已过期，本次写入被拒绝、列表同步，并提示核对后重试；重试添加会合入最新列表，版本冲突仍必须提升版本。等待锁时可以取消/关闭，排队中的旧操作不会在重新打开后落库。

写入需要支持 Web Locks 的 HTTPS 或 localhost 页面；锁不可用时明确拒绝保存，读取和导出仍可用。该协议适用于使用新版写入接口的窗口，旧版页面或外部直接修改 localStorage 不参与 Web Lock，不能算作已经验收的并发保证。旧模板包仍可读取；`libraryRevision` 仅是本机库元数据，不改变导入导出格式版本。

同 ID、同版本内容不可修改；提升版本保存新版本。重复导入相同内容幂等。已添加节点持有完整快照，更新、移除本机模板不会修改已有工作流。新模板不会覆盖内置节点或其他模板。

## 契约

模板包：`{"format":"aetherflow-custom-nodes","formatVersion":1,"nodes":[...]}`。

单个定义包含 `formatVersion:1`、`id`、`version`、`name`、`description`、`kind`（`API` / `CODE`）、`inputs`、`fields`、`outputs`。单个定义上限 64 KiB；每组最多 32 个字段。字段类型是 `STRING`、`NUMBER`、`BOOLEAN`、`OBJECT`、`ARRAY`，支持 `required`、`defaultValue` 和字符串 `options`。输出另有 `path`。

输入、表单和输出字段从 STRING 改为非字符串类型时，编辑器移除不适用的 `options`（包括空数组），保留字段名称、必填性、路径和默认值。默认值与新类型不兼容时显示提示，用户可修改或显式清空；不会自动转换或丢弃默认值。切回 STRING 不恢复旧枚举选项。导入的非字符串字段若仍含 `options`，两端校验继续明确拒绝。

输出路径遵循 JSON Pointer：数组仅接受规范的非负整数下标，例如 `/0`、`/1`；前导零、负数、`-`、非数字、越界值及 `/length` 不读取数组元素。对象仍按成员名读取，因此对象的 `length`、`01`、`-` 和空键合法。`~1` 表示 `/`，`~0` 表示 `~`，转义只解码一次；空路径读取整个响应。缺失或 null 的必填输出报错，可选输出省略。前端预览和 Java 映射共用 `custom-node-pointer-cases.json` 的 40 个对照用例，覆盖数组、对象、根值与转义边界。

可选枚举选择「请选择」保存为显式 `null`，覆盖默认值并在执行参数中省略该字段；必填枚举清空仍被拒绝。预览会先解析和校验请求头占位符及其值，再遮蔽显示，缺失值不能被遮蔽逻辑绕过。

API 例子见 [custom-nodes-example.json](custom-nodes-example.json)。模板和默认值随导出及工作流保存，**不要放入密钥**。本次不新增凭据存储，也不自动读取环境变量或现有连接密钥。

API 的 `request` 含 `method`、`url`、`headers`，以及可选 `body`。只支持同步 JSON 请求；不轮询、不自动重放。占位符仅允许 `{{inputs.name}}` 和 `{{config.name}}`，没有表达式求值。整个 JSON 值为占位符时保留数字、数组和对象类型；嵌入文本时必须是标量。URL 替换值编码，保留模板原有 URL 字符。GET/HEAD 不能有请求体；传输控制请求头不能覆盖。最终 URL 仍由原有 `UrlRequestPolicy` 校验，沿用 `HttpJsonRequestService` 的网络范围、截止时间、请求与响应大小限制及禁止重定向行为，不增加网络权限。

Python 入口：

```python
def main(payload):
    text = payload["inputs"]["text"]
    prefix = payload["config"].get("prefix", "")
    return {"result": prefix + text.upper()}
```

扩展只接收声明输入与表单值，不转发整个工作流上下文。现有独立运行时的 Python 语法限制仍适用，不支持导入第三方依赖、任意语言插件或业务服务进程内执行。stdout、耗时和截断状态进入正常节点输出日志。所有输出先校验，再一次性发布；类型错误或必填输出缺失时不发布部分变量。

持久化保持 `HTTP_REQUEST` / `CODE` 节点类型，新增 `config.customDefinition`、`customInputs`、`customValues`、`inputBindings`；路由继续使用既有 `nextNodes`。不改变旧工作流格式和旧内置节点默认行为。服务端保存校验识别快照，并在执行前再次校验；未知格式版本或类型不匹配明确拒绝。字段绑定的值在执行时校验。

## 代码执行与部署边界

代码节点仍要求既有 `codeExecutionEnabled` 与 `codeRuntimeIsolationConfirmed` 门禁，默认关闭。模板不能启用这些开关、指定运行时地址或申请权限。本次未修改部署文件、运行时实现、宿主设置、凭据或网络，也未启动/重启 Docker。

复用仓库已有 `code-runtime-service` 与 HTTP 运行时适配器：业务 JVM 不解释 Python；独立服务再创建可超时终止的子进程。现有 Compose 声明只读根、无新增宿主挂载、临时 `/tmp`、移除 capabilities、禁止提权、512 MiB 容器内存、1 CPU、64 PID，以及内部运行时网络。子进程既有 CPU/地址空间/输出限制和进程组清理逻辑保持不变。**这些是现有部署声明，不是本次执行验证的隔离保证**；本地 Windows 环境未验收这些资源与网络边界。

实际启用前需要维护者另外决定并授权：采用哪个已审查的隔离执行环境；确认实际网络仅允许必要的工作流调用且阻止用户程序访问业务服务和外网；确认没有宿主目录、业务密钥或 Docker socket 进入代码执行环境；配置独立运行时专用凭据及生命周期；批准启动和真实沙箱资源/清理验收。不能仅设置「已确认隔离」来替代这些验收。若实际环境不能满足边界，保持代码功能关闭。这里没有自动安装运行时或调整权限的脚本。

运行协调器保存本轮所有派发 Future，消费完成项后移除；取消、并行失败或其他退出路径先关闭本轮派发，再 `cancel(true)` 回收尚未完成的任务。工作线程在开始、返回和重试前检查取消与本轮关闭标记，协调器在消费结果及继续派发时检查取消，避免迟到成功或失败触发下游/重试。自定义 API 在请求前、返回后均检查中断；已有 HTTP 服务会取消等待中的 future。代码节点在调用前后检查中断；远端 worker 可能继续至原有超时上限后才被回收，**未新增远端即时取消协议**。取消或失败后不自动重放 API 写入；手动重跑可能重复远端副作用，调用方应使用业务幂等键。表单预览失败保留编辑值，关闭模板编辑器不保存；重新打开清空未保存草稿。

## 验收与验证限制

| 条目 | 本次证据 |
| --- | --- |
| 两类模板创建、保存与恢复 | Vue DOM 交互测试 |
| 版本、导入导出、原子失败、损坏库恢复 | TypeScript 契约与存储测试 |
| 多窗口旧快照、同时提交、版本不可变、冲突重试与删除、锁等待取消 | 受控 Web Lock 交错测试与 Vue DOM 测试；未做真实多窗口验收 |
| 工作流往返、输出变量类型、旧节点兼容 | 前端 mapper / preflight / 变量测试，Java 受控执行器测试 |
| API 占位符与类型、响应映射、失败后重跑 | Java/TypeScript 受控数据测试 |
| 代码独立适配、仅声明参数、超时/输出上限、关闭门禁 | Java 运行时替身测试；未执行用户 Python |
| 在途 API/代码取消、完成瞬间取消、重试等待取消、并行失败清理 | 真实引擎派发/线程与受控 HTTP/代码替身整合测试 |
| 可选枚举 null 保存往返、执行参数省略、编辑取消与 Tab 环绕 | Java 保存校验/执行器替身、TypeScript mapper 与 Vue DOM 测试 |
| 真 HTTP、真实 Python 沙箱、资源/网络拒绝与进程清理 | 未执行；需要另外授权的真实部署验收 |
| 浏览器视觉、桌面和窄屏布局 | 独立标签连接本地隔离预览超时；本次仅 DOM 验证 |

定点测试命令（不运行全量测试）：

```powershell
cd frontend
node node_modules/vitest/vitest.mjs run src/components/workflow/CustomFieldSchemaEditor.test.ts src/utils/customNodePointers.test.ts src/utils/customNodes.test.ts src/customNodeReviewRegression.test.ts src/components/workflow/CustomNodeLibrary.test.ts
node node_modules/vue-tsc/bin/vue-tsc.js -b
node node_modules/vite/bin/vite.js build
```

如测试临时目录受沙箱限制，将当前测试进程的 `TEMP` / `TMP` 指向授权的临时目录。不要修改系统环境设置。

```powershell
mvn -o -Pcustom-node-contract-tests -pl backend/workflow-service -am '-Dtest=CustomNodeDefinitionTest,CustomNodeExecutorTest,WorkflowNodeConfigValidatorTest,WorkflowRuntimeCancellationTest,WorkflowRuntimeEngineTest' '-Dsurefire.failIfNoSpecifiedTests=false' '-DforkCount=0' test
```

该 opt-in Maven profile 仅限制 workflow-service 的测试编译范围；默认构建不变。当前基线另有三个无关测试编译错误（`StructuredDataMapperTest`、`NestedWorkflowRecoveryTest`、`WorkflowVersionServiceTest`），本次未修改。此环境中的默认 Mockito 动态 attach 与 Java 回环连接受限，执行器测试使用显式注入的受控替身，无需 Mockito attach 或创建真实 HTTP 客户端。通过这些测试不能宣称真实沙箱通过。
