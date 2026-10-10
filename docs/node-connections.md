# 节点连接与 Whisper 环境设置（第一期）

## 使用方式

图像生成和图像放大节点现在可在节点面板中选择已有连接，或添加 ComfyUI / Stable Diffusion WebUI 连接。填写名称与服务地址后先测试，再保存。测试只读取服务目录，不发起图像生成，也不会自动保存配置。

- 连接配置在 AI Service 按当前用户范围持久化到现有 Redis；节点只保存 `connectionId`、Provider 和本节点自己的生成参数
- 同一个连接可供多个节点复用；编辑连接会影响引用它的节点，界面会在编辑时提醒
- 未设置 `connectionId` 的旧节点继续使用已有部署默认和路由策略；原有图像 Provider 开关不会被向导自动打开
- 部署默认连接只读。显式选择的连接不存在、不可达或不支持选项时直接报错，不静默切换到其他地址或 Provider
- 工作流开始前，服务端会校验实际连接与选定参数。执行时会再次解析指定连接；界面上的提前提示不替代服务端门禁
- ComfyUI 的标准生成需要明确选择 Checkpoint，不能把默认的 `model.safetensors` 猜成用户已经安装的模型
- 选择另一连接时保留节点原有参数；不支持或无法验证的值会保留显示并告警，需要用户选择新值
- 旧节点没有连接引用时，现有模型参数保留且不被自动改写；要编辑服务发现的动态选项，先显式选择已有连接（包括只读部署连接）

## 哪台机器在检测

所有检测由 **AI Service 所在的后端进程或容器** 发起。地址里的 `localhost` / `127.0.0.1` 指后端所在环境，不是打开浏览器的电脑。在 Docker 中访问宿主机服务时，使用部署环境支持的宿主机地址，并确保服务监听与网络配置允许访问。

连接只接受明确填写的 HTTP(S) 地址，不接受 URL 中的账号、密码、查询参数或片段。本期没有密钥或密码保存功能；需要认证的外部图像服务尚不在该向导支持范围内。没有自动扫描候选端口、用户目录或模型文件。

## 发现结果的含义

测试返回服务公开的选项，包括 Checkpoint、VAE、LoRA、采样器、调度器和放大方法。成功读取的空目录与读取失败是两种情况：读取失败或格式不完整时显示“未知”，不能认定模型不存在。

- `unconfigured`：部署连接未启用、地址未配置，或未发现该节点需要的能力
- `unreachable`：指定服务无法连接、超时或未返回有效目录
- `missing_model`：完整读取的 Checkpoint 目录没有可用项，或未列出明确选定的 Checkpoint
- `usable`：服务接口和当前探测条件可用；不代表已经完成一次真实生成

图像服务目录不能普遍证明某个模型是否已加载到显存，因此这里不报告图像模型 `loaded` / `unloaded`。ComfyUI 当前内建放大执行使用 `ImageScaleBy` 的插值方法，不把 `UpscaleModelLoader` 的权重列表冒充为可执行方法。Stable Diffusion WebUI 放大目录也可能包含普通算法或按需取得权重的实现，列出某项不代表所有文件已经下载。

可选目录（如旧版 SD WebUI 的调度器接口）不可用时，会保留其他已知目录并显示警告；明确选择了无法验证的参数时，服务端预检会要求重新检查。

### 官方接口核实基线

以下版本只用于核实实现契约，不表示用户当前实际运行这些版本：

- ComfyUI `0.39.0`，提交 `0df64eb242b7c5759c3e86afd5d1846d923b1033`：[版本声明](https://github.com/Comfy-Org/ComfyUI/blob/0df64eb242b7c5759c3e86afd5d1846d923b1033/comfyui_version.py)、[发现路由](https://github.com/Comfy-Org/ComfyUI/blob/0df64eb242b7c5759c3e86afd5d1846d923b1033/server.py)、[节点输入定义](https://github.com/Comfy-Org/ComfyUI/blob/0df64eb242b7c5759c3e86afd5d1846d923b1033/nodes.py)。本实现只读 `/object_info`，从节点输入枚举取服务选项
- AUTOMATIC1111 `v1.10.1`，提交 `82a973c04367123ae98bd9abdf80d9eda9b910e2`：[API 实现](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/82a973c04367123ae98bd9abdf80d9eda9b910e2/modules/api/api.py)、[响应类型](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/82a973c04367123ae98bd9abdf80d9eda9b910e2/modules/api/models.py)、[LoRA 接口](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/82a973c04367123ae98bd9abdf80d9eda9b910e2/extensions-builtin/Lora/scripts/lora_script.py)。读取 `/sdapi/v1/options` 以及 `sd-models`、`sd-vae`、`loras`、`samplers`、`schedulers`、`upscalers`
- 兼容性反例：AUTOMATIC1111 `v1.8.0` 的 [固定 API 源码](https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/bef51aed032c0aaa5cfd80445bc4cf0d85b408b5/modules/api/api.py) 没有 `schedulers` 路由。该目录应显示未知；留空调度器可使用服务默认

## Whisper 是一个后端环境

Whisper 节点提供“环境状态与设置说明”，不是每个节点独立选择模型的连接管理器。当前 Python AI Service 仍只加载一个模型。

界面显示启用状态、当前模型/设备/计算类型、实际加载的模型、依赖与 FFmpeg 状态，以及可复制的当前环境变量。根据说明在 Python 服务进程/容器中配置，然后由部署者手动重建或重启服务。仅刷新面板不会应用新配置。Compose 现已透传 `.env.example` 中已有的 `WHISPER_DEVICE` 和 `WHISPER_COMPUTE_TYPE`。

状态读取不加载模型、不安装依赖、不下载模型，也不检查任意模型目录。正常启用后的服务启动按 faster-whisper 原有行为加载配置模型；若未预置模型，它可能需要从模型源获取文件，应由部署者提前安排。详见 [Python 环境说明](../python-ai-service/README.md)。

修复了原启动流程的循环依赖：过去只有“模型已加载”才尝试加载模型，冷启动会永远跳过。现在只在服务启动阶段尝试加载，并将实际加载结果用于状态判断；测试使用假模型构造器，不下载模型。

## 接口

- `GET /ai/node-connections`：当前用户连接及只读部署连接
- `POST /ai/node-connections`、`PUT /ai/node-connections/{id}`：明确保存连接；保存前重新测试，失败不覆盖旧配置
- `POST /ai/node-connections/probe`：测试尚未保存的明确地址，不持久化
- `GET /ai/node-connections/{id}/probe`：刷新已有连接的目录与状态
- `GET /ai/node-connections/whisper`：读取 Python 环境快照
- 内部 `POST /ai/internal/workflow/nodes/connections/validate`：工作流执行前验证显式引用的连接和节点选项

## 范围与验证

本期不支持自动安装、模型下载管理、GPU/CUDA 依赖配置、自动启停服务、任意目录扫描、浏览器电脑的本地助手、图像服务凭据保存或 Whisper 热切换。自定义 ComfyUI 工作流仍沿用现有执行实现，连接探测只验证标准节点目录，不能完整验证任意自定义工作流的实际可执行性。

回归使用内存模拟、Mock HTTP 响应和假 Whisper 模型。连接选择、保存与运行预检均有定点测试；没有访问任何用户本地 AI 服务，也没有进行真实模型生成或部署。

本次还单独回归两项执行兼容修复：`ImageScaleBy` 传入所选 `upscale_method`；工作流的 `sourceImage` 映射到现有图像输入，若同时提供非空 `sourceImageBase64` 则保留后者优先。没有改写放大算法。
