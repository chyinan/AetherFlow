# Python AI 服务：Whisper 环境状态

Whisper 仍由 Python AI 服务的单个全局模型实例提供。模型只在服务启动时加载；更改配置后必须由部署者手动重启服务，没有在线配置写入、热切换或模型下载接口。

## 手动设置

在 **Python AI 服务进程/容器的环境变量** 中设置：

```dotenv
ENABLE_WHISPER=true
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

- `WHISPER_MODEL` 可以是 faster-whisper 支持的模型名称，也可以是已经部署到服务环境中的模型目录；它不是浏览器或用户电脑上的路径
- 按 `requirements.txt` 准备服务依赖。启用后，正常服务启动可能按 faster-whisper 的行为获取指定模型，需要提前安排模型文件、网络与算力资源
- 将这些变量实际传入容器后，重新创建对应服务进程；只修改宿主机 `.env` 或执行容器内页面刷新并不会改变现有进程的环境
- Whisper 工作流节点的现有执行门禁还要求服务环境中存在 FFmpeg，即使模型已经加载也不能跳过此项；单独读取状态不会执行 FFmpeg
- 本次回归仅使用假的模型构造器，没有安装 faster-whisper、下载模型或验证实际推理性能

## 只读接口

`GET /ai/whisper/environment` 使用现有运行时接口的 `X-API-Key` 依赖。返回当前服务进程看到的配置，以及本次启动的加载结果：

- `status`：`unconfigured`（未启用，或已加载模型但缺少 FFmpeg 前置条件）、`unloaded`（未加载）、`missing_model`（启动加载发生明确的文件缺失）或 `usable`（已启用、实际实例已加载且 FFmpeg 可用）
- `enabled`、`model`、`device`、`computeType`：当前有效环境配置
- `loadedModel`：成功构造当前运行实例时使用的模型名称或路径；没有已加载实例时为 `null`
- `dependencyAvailable`：已尝试启动时使用其依赖加载结果；尚未尝试启动时仅检查包是否可发现，不保证硬件或模型可用
- `ffmpegAvailable`：FFmpeg 是否在服务环境的可执行路径中
- `detectedFrom`：固定为 `backend`
- `restartRequired`：启用但未加载，或当前环境配置与启动快照不同
- `message`：不包含原始异常详情的操作提示
- `environmentVariables`：仅上述四个 Whisper 环境变量的当前值，供界面复制和部署者手动设置

配置变更不替换已加载模型。例如启动时加载 `small`，当前进程配置后来变成 `large-v3`，接口仍显示 `loadedModel=small`、`model=large-v3` 和 `restartRequired=true`。`usable` 表示旧实例及 FFmpeg 满足当前 Whisper 节点的环境前置条件，不表示新配置已生效。设备或计算类型变化同样会要求重启。

模型已加载但 FFmpeg 缺失时，接口保留实际 `loadedModel`，整体状态为 `unconfigured`，与 `AiWorkflowCapabilityEvaluator` 的节点执行门禁一致。补齐 FFmpeg 后重新检测即可更新状态，不重新加载 Whisper；若需更新镜像或进程环境，则由部署者手动重建或重启服务。`restartRequired` 只描述已知的模型未加载或启动配置变化，不会因 FFmpeg 的动态检测结果单独置为 `true`。

此接口不读取模型目录、不自动发现用户机器文件、不重新加载环境配置，也不创建模型。无法仅靠静态配置确认模型是否缺失时返回 `unloaded`，不会猜测为 `missing_model`。在进程外改动部署文件后、重启前，接口只能看到旧进程的环境值。

## 聚焦回归

在仓库根目录运行（兼容 PowerShell）：

```text
python -m unittest discover -s python-ai-service/tests -p test_whisper_environment.py -v
```

测试把所有 Whisper 构造、环境加载、FFmpeg 可用性和依赖检测替换为内存假实现；不启动真实服务、不访问外部模型服务、不下载模型。
