# 无代码结构化数据映射

`TEMPLATE_TRANSFORM` 节点增加 `transformMode: "structured"`，原来的文本模板默认行为不变。编辑器中搜索“数据映射”，选择“模板 / 数据映射”节点，再切换“结构化数据映射”。

## 配置步骤

1. 选择提取字段、构造 JSON 对象、数组 map 或数组 filter
2. 填入输入字段路径，例如 `segments`、`response.data.items` 或 `segments[0].text`
3. 选择输出对象字段或单个值。每个值支持字段路径、文本模板或 JSON 固定值
4. 可对数组启用非空、相等、文本包含或数字大小筛选
5. 在“输入 / 输出预览”中粘贴示例工作流变量，点击“预览输出”
6. 点击“应用映射”，然后保存工作流。未应用的面板草稿不会替换已保存的节点配置

示例输入只留在当前面板，不进入工作流配置，也不会调用模型或上传到服务端。应用后的配置会经正常工作流保存流程持久化；服务端会再次验证其字段与操作。

## 路径和取值规则

- 输入路径相对于工作流变量对象；字段映射和筛选路径相对于选中的输入或当前数组项
- `$` 表示当前值，`$.field` 与 `field` 等价，`[0]` 表示数组下标
- `$index` 仅供数组映射使用，表示筛选前的原始下标，从 0 开始
- 对象输出目标支持 `timing.start` 等点分隔路径；不允许重复或相互覆盖的目标字段
- 默认遇到缺失路径即报错。选用 `missingPolicy: "null"` 时，缺失字段保留为 JSON null，模板中渲染为空文本
- null 可以出现在输出对象或数组中；顶层 null 不符合工作流变量契约，请用对象字段承载
- 文本模板只替换 `{{ 字段路径 }}`，不求值脚本、函数、算术或条件表达式。对象和数组应通过字段映射保留，不能隐式转成模板文本
- JSON 常量保持布尔、数字、null、对象和数组类型。文字常量请写成 JSON 字符串，例如 `"写实风格"`
- 筛选的 empty/notEmpty 将缺失、null、空白文本、空数组和空对象视为空；数字 0 和布尔 false 不为空
- equals/notEquals 为类型敏感的深层 JSON 比较；数字大小比较只接受数字，不转换数字字符串。contains 仅匹配文本

每个数组最多 1000 项、对象映射最多 100 字段、路径/输出最多 32 层、输出最多 20000 个 JSON 值、单文本最多 100000 字符、总文本最多 1000000 字符。超限明确失败，不静默截断。

## Whisper → prompt 列表

编辑器提供一键示例。真实链路为：文件输入 → Whisper → 模板 / 数据映射。

Whisper 保留 `transcription`、字幕和 `durationSeconds`，同时发布 `segments`：

```json
{"segments":[{"start":0,"end":2.5,"text":"清晨的海边"},{"start":2.5,"end":3,"text":" "},{"start":3,"end":5,"text":"远处的帆船"}]}
```

结构化节点配置见 [whisper-prompts-mapping.json](examples/whisper-prompts-mapping.json)。它先过滤空片段，再逐项生成字符串，将结果写入 `promptList`：

```json
["请为 0–2.5 秒的片段生成画面提示词：清晨的海边","请为 3–5 秒的片段生成画面提示词：远处的帆船"]
```

`promptList` 是真正的 JSON 字符串数组，可以作为后续支持数组输入的节点或子工作流的显式输入。映射节点只负责数据变换，不会自动为每项调用图片或 LLM 节点。Whisper 未识别到片段时输出空数组；旧版 Python 响应省略 segments 时也兼容为空数组，因此实际使用该示例前需同步升级 Python AI Service。对于本来就没有 segments 变量的输入，映射默认报告缺失路径。

## 验证

前后端共用 `backend/workflow-service/src/test/resources/structured-mapping-cases.json`。

- 前端：`cd frontend; npm test; npm run build`
- Java 集成：`mvn -pl backend/workflow-service,backend/ai-service -am test`
- 无 Maven 依赖的 Java 映射核心检查：设置 `JAVA_HOME` 到 JDK 17+ 后运行 `python scripts/test_structured_mapping.py`
- Python 片段契约：`python -m unittest discover -s python-ai-service/tests -p test_transcription_segments.py`

Java 核心检查直接编译实际映射器及共享数据，不代替 Spring、DTO、节点保存或运行器集成测试。所有新增测试使用固定数据或 mock，不需要真实 ASR/LLM 服务。
