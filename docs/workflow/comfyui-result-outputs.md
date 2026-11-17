# ComfyUI 自定义工作流的非图片输出

新增的非图片结果处理仅适用于 ComfyUI 的显式 `mode=workflow` 自定义/API 工作流。普通 `txt2img`、`img2img` 与 `upscale` 保持既有图片产物分类、错误语义和元数据形状；不能把它们的输出重新解释为媒体或元数据成功。

## 支持范围

- 对 `mode=workflow`，`outputs[*].images` 中只有 `/view` 响应 MIME 明确证明为受支持的音频类型或 `video/mp4` 才会变成媒体产物；不会根据扩展名或 `animated` 标志推断视频。其他 MIME 缺失的图片引用仍按既有 `image/png` 回退处理。
- 对 `mode=workflow`，官方 `outputs[*].audio` 引用仅通过 ComfyUI `/view` 契约读取，并限于 `type=output` 或 `type=temp`。只有识别的音频扩展名才允许下载；响应为 `application/octet-stream` 或没有 MIME 时，才根据该音频输出引用的扩展名确定 MIME。
- 支持 `audio/aac`、`audio/flac`、`audio/mp4`、`audio/mpeg`、`audio/ogg`、`audio/opus`、`audio/wav` 和明确标记的 `video/mp4`。每次最多持久化 16 个媒体产物，单个媒体产物最多 50 MiB。内部文件服务仍执行生成产物类型和解码大小验证；不会扩大公开上传允许类型。
- 图片和媒体分别通过 `imageFiles` / `imageUrls` 与 `mediaFiles` / `mediaUrls` 暴露。媒体还提供首个产物的 `mediaFileId`、`mediaObjectKey`、`mediaUrl` 和兼容别名 `fileUrl`，并保留有序数组供多产物使用。
- 媒体通过现有异步生成产物通路持久化；该兼容范围要求工作流异步执行。异步关闭时由已有预检拒绝此节点，不承诺同步媒体交付。

## 无产物结果与失败

- `mode=workflow` 下，无法识别的输出字段以及文本输出会进入有界的 `imageGenerationMetadata.comfyOutputMetadata` 摘要，不会被当成图片或任意链接抓取。
- 只有自定义工作流模式明确报告终态 `success` 且返回非空 `outputs` 时，无产物文本或其他非媒体输出才作为元数据成功返回。状态缺失、未知、失败或未完成时仍按失败处理；普通图片模式没有图片时仍按既有 EMPTY 错误处理。
- 已识别引用的 `/view` 请求失败仍是产物下载失败；不因其他字段存在而降级为成功。

## 验证范围

`ComfyUiProviderNonImageOutputTest` 使用模拟 HTTP 覆盖 FLAC 的通用 MIME 回退、MIME 明确的视频、动画 PNG 图片兼容、普通模式缺失 MIME 与 32 节点元数据截断后的图片引用兼容、自定义工作流文本元数据成功、普通模式文本输出失败、未知扩展名和输入路径拒绝、未知终态失败，以及已识别媒体引用的下载失败。未连接真实 ComfyUI 服务；运行 Java 测试需在具备 Maven 的环境中执行。
