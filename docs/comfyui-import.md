# ComfyUI 导入与执行边界

导入创建 `START → PROMPT → IMAGE_GENERATION → END` 四个 AF 外层节点。图像节点保存完整原图，不把插件节点转换成 AF 原生节点。节点标题显示原图节点数和格式；检查器显示内部节点清单、完整原始 JSON、未解析文本和插件未验证状态。

## 界面 JSON 与 API JSON

- 普通界面 JSON 使用 `nodes`、`links`、`widgets_values` 等结构。可导入、保存和查看，不能直接作为 `/prompt` 的 API 图提交。前端预检、服务端启动预检和 ComfyUI Provider 都阻止误运行，并提供下一步。
- 在用户已有的 ComfyUI 中导出 API 格式 JSON，再通过图像节点的“载入 API 执行图”选择该文件。该操作只替换执行图并清空旧参数绑定，保留原始界面图；不会运行或安装插件。
- API 图按节点 ID 索引，节点含 `class_type` 和对象形式的 `inputs`。未知插件类型、输入引用、每阶段参数以及 `_meta` 等附加字段原样保留。混合 UI/API 结构和无效格式会报错，不静默删节点。
- `workflow` 保存原始图；`workflowJson` 保存当前执行图。各层统一使用 `workflowJson ?? workflow`，对象与合法对象 JSON 文本等价；展示、目标枚举、绑定、连接检查、保存预检及 AI 请求都解码同一份执行图。无效文本保留并报错，不回退普通生成；保存 mapper 会将合法文本规范化为对象。
- `mode=workflow` 必须提供有效 API 图，包括用户清空执行图后的情况。普通 `txt2img/img2img` 未提供导入图时继续使用既有内置生成路径。

## 保真执行与显式绑定

API 图默认按原参数执行。通用 AF 的提示词、种子、步数和模型字段不会自动覆盖全部同类节点，也不会按对象遍历顺序推断正负文本。

检查器可明确选择执行图输入及其 AF 参数。例如：

```json
{
  "workflowBindings": [
    { "nodeId": "refine", "inputName": "steps", "parameter": "steps" },
    { "nodeId": "positive", "inputName": "text", "parameter": "prompt" }
  ]
}
```

只有这些输入接收 AF 字段或提示词变量的值。绑定不存在或重复的目标会报错；覆盖链接输入意味着用户明确替换该上游引用。支持的参数为 `prompt`、`negativePrompt`、`seed`、`steps`、`cfgScale`、`sampler`、`scheduler`、`width`、`height`、`batchSize`、`denoiseStrength`、`checkpoint`、`vae`、`sourceImage`。未绑定种子不会抽取随机数；多个显式种子绑定共享一次随机抽取。源图只有显式绑定时才为导入图上传。绑定仅限图像生成导入路径，内置 Upscale 行为不变。

绑定经工作流服务送达 AI 执行器，在 Provider 内消费，不把 `workflowBindings` 发给 ComfyUI。有效 `sourceImage` 绑定启用已有图片输入入口和 ImageSourceResolver：上游 ID、ID 数组第一项、Base64 与数据 URL 在同步调用或异步派发前解析；无绑定的 API 图不读取遗留源图变量。导入图执行不会回退到 SD WebUI，避免另一个 Provider 用普通生图替代原图语义。

## 摘要、插件与原生前端

提示词摘要沿 KSampler 的 positive/negative 引用识别。能够静态解析的 CLIP/PrimitiveString 字面量可显示；插件文本链、多阶段不一致或断开的引用显示未解析，不拿负向文本补正向。摘要元数据 `comfyImport` 只作提示，不控制实际执行。

`PROMPT.stylePreset=comfyui-import` 明确表示导入摘要变量模式，允许正向为空或未解析；目录说明、检查器必填标记、前端预检和真实 DAG 保存校验使用这一局部契约。普通 PROMPT 的正向文本仍必填。载入 API 图不需要虚构提示词来解除保存或预检阻断。

显式 ComfyUI 连接在运行校验时按 API 图实际使用的类型读取 `/object_info`，缺少类型时列出名称并停止；不会强制插件图经过标准 CheckpointLoader/KSampler 路径。节点类型存在仍不证明模型、显存、插件版本或真实运行成功。

新增/编辑连接的测试和保存都携带当前执行图的 `workflowNodeTypes`，保存时重新按图验证；类型缺失则不写入。已有连接支持带类型上下文的只读 POST 探测，普通 GET 探测与无图连接的原校验不变。节点类型上下文不持久化为连接能力保证；失败后可以重新测试或重试保存，原图和旧连接不被失败请求覆盖。

Nodes 2.0 等渲染外观切换不改变本期 API 图边界。插件自带前端的控件、动态输入、widget 序列化及子图展开仍由用户原有的 ComfyUI 前端完成。本期没有通用 UI→API 编译器，也没有承诺完整编辑任意插件前端。`workflow` 与 `workflowJson` 的独立保存边界为后续原生序列化桥接保留入口；可靠的桥接必须产生并验证 API 图，不能只换外观或硬编码 widget 下标。

## 验证范围

定点回归使用脱敏的最小插件、多阶段和文本链图；受控 payload、Mock 服务目录和界面组件验证不等于真实 ComfyUI、模型或设备验收。用户原文件仅在本机进行只读纯转换回归，不纳入补丁。
