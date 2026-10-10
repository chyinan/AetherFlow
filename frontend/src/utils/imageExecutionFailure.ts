// pattern: Functional Core
export const imageFailureStages = ['INPUT', 'UPLOAD', 'QUEUE', 'POLL', 'GENERATION', 'DOWNLOAD', 'REQUEST', 'OUTPUT'] as const
export const imageFailureFields = ['sourceImage', 'workflow', 'checkpoint', 'sampler', 'scheduler', 'vae', 'lora', 'upscaler', 'timeoutSeconds', 'connectionId', 'seed', 'mode'] as const
export const imageFailureReasons = ['VALIDATION', 'HTTP', 'UNREACHABLE', 'TIMEOUT', 'INTERRUPTED', 'REJECTED', 'FAILED', 'EMPTY', 'INVALID_RESPONSE'] as const

export interface ImageExecutionFailure {
  provider: 'COMFYUI' | 'SD_WEBUI' | 'AI_SERVICE'
  stage: typeof imageFailureStages[number]
  field: typeof imageFailureFields[number]
  reason: typeof imageFailureReasons[number]
}

export function parseImageExecutionFailure(message: unknown): ImageExecutionFailure | null {
  if (typeof message !== 'string') return null
  const match = /\[IMAGE_EXECUTION:(COMFYUI|SD_WEBUI|AI_SERVICE):([A-Z_]+):([a-zA-Z]+):([A-Z_]+)\]/.exec(message)
  if (!match || !imageFailureStages.includes(match[2] as ImageExecutionFailure['stage'])
    || !imageFailureFields.includes(match[3] as ImageExecutionFailure['field'])
    || !imageFailureReasons.includes(match[4] as ImageExecutionFailure['reason'])) return null
  return { provider: match[1] as ImageExecutionFailure['provider'], stage: match[2] as ImageExecutionFailure['stage'],
    field: match[3] as ImageExecutionFailure['field'], reason: match[4] as ImageExecutionFailure['reason'] }
}

export const imageExecutionFailureMessages = {
  'zh-CN': {
    title: '{provider} · {stage}失败', locate: '定位 {field}', noNode: '在工作流编辑器中打开对应节点，检查 {field}',
    retry: '修改后先测试连接，再手动重新运行', pending: '远端任务可能仍在执行；先查看服务队列，再决定是否重新运行',
    stages: { INPUT: '输入检查', UPLOAD: '源图上传', QUEUE: '工作流提交', POLL: '等待结果', GENERATION: '图像生成', DOWNLOAD: '结果下载', REQUEST: '服务调用', OUTPUT: '结果读取' },
    reasons: { VALIDATION: '输入配置不符合要求', HTTP: '服务拒绝了请求', UNREACHABLE: '暂时无法连接到图像服务', TIMEOUT: '等待超过了配置的时限', INTERRUPTED: '等待或执行已中断', REJECTED: '服务未接受当前工作流或参数', FAILED: '服务未能完成此步骤', EMPTY: '服务没有返回有效图像结果', INVALID_RESPONSE: '服务返回的结果格式不正确' },
    fields: { sourceImage: '源图', workflow: '工作流 JSON', checkpoint: 'Checkpoint', sampler: '采样器', scheduler: '调度器', vae: 'VAE', lora: 'LoRA', upscaler: '放大模型', timeoutSeconds: '超时时间', connectionId: '服务连接', seed: '随机种子', mode: '生成模式' },
    actions: { sourceImage: '重新选择有效图片，或检查上游输出绑定', workflow: '检查服务端工作流节点与输出，确认导入的是 API 格式 JSON', checkpoint: '刷新模型目录，并选择已安装的 Checkpoint', sampler: '从连接探测目录选择兼容采样器', scheduler: '从连接探测目录选择兼容调度器', vae: '检查所选 VAE 是否已安装且与模型兼容', lora: '检查 LoRA 名称与所选模型是否匹配', upscaler: '刷新目录并选择已安装的放大模型', timeoutSeconds: '查看服务队列和模型运行状态，再按需调整超时', connectionId: '测试连接，确认后端可访问服务地址且服务已启动', seed: '使用 -1 或合法非负整数', mode: '选择当前服务支持的生成模式' },
  },
  'en-US': {
    title: '{provider} · {stage} failed', locate: 'Go to {field}', noNode: 'Open the corresponding workflow node and check {field}',
    retry: 'Test the connection after changes, then run again manually', pending: 'The remote task may still be running. Check its queue before running again',
    stages: { INPUT: 'Input validation', UPLOAD: 'Source upload', QUEUE: 'Workflow submission', POLL: 'Waiting for results', GENERATION: 'Image generation', DOWNLOAD: 'Result download', REQUEST: 'Service request', OUTPUT: 'Result decoding' },
    reasons: { VALIDATION: 'The input configuration is invalid', HTTP: 'The service rejected the request', UNREACHABLE: 'The image service could not be reached', TIMEOUT: 'The configured wait time was exceeded', INTERRUPTED: 'Waiting or execution was interrupted', REJECTED: 'The workflow or parameters were not accepted', FAILED: 'The service could not complete this step', EMPTY: 'The service returned no valid image', INVALID_RESPONSE: 'The service returned an unexpected response' },
    fields: { sourceImage: 'source image', workflow: 'workflow JSON', checkpoint: 'checkpoint', sampler: 'sampler', scheduler: 'scheduler', vae: 'VAE', lora: 'LoRA', upscaler: 'upscaler', timeoutSeconds: 'timeout', connectionId: 'connection', seed: 'seed', mode: 'mode' },
    actions: { sourceImage: 'Select a valid image or check the upstream output binding', workflow: 'Check the service workflow nodes and output; imported JSON must use the API format', checkpoint: 'Refresh the model catalog and select an installed checkpoint', sampler: 'Select a compatible sampler from the discovered catalog', scheduler: 'Select a compatible scheduler from the discovered catalog', vae: 'Check that the VAE is installed and compatible with the model', lora: 'Check that the LoRA name and model match', upscaler: 'Refresh the catalog and select an installed upscaler', timeoutSeconds: 'Check the service queue and model state before adjusting the timeout', connectionId: 'Test the connection and confirm the backend can reach the running service', seed: 'Use -1 or a valid nonnegative integer', mode: 'Select a mode supported by this service' },
  },
  'ja-JP': {
    title: '{provider} · {stage}に失敗', locate: '{field}を確認', noNode: 'ワークフローで該当ノードを開き、{field}を確認してください',
    retry: '変更後に接続をテストし、手動で再実行してください', pending: 'リモートの処理が続いている可能性があります。再実行前にキューを確認してください',
    stages: { INPUT: '入力確認', UPLOAD: '元画像のアップロード', QUEUE: 'ワークフロー送信', POLL: '結果待機', GENERATION: '画像生成', DOWNLOAD: '結果ダウンロード', REQUEST: 'サービス呼び出し', OUTPUT: '結果の読み取り' },
    reasons: { VALIDATION: '入力設定が要件を満たしていません', HTTP: 'サービスがリクエストを拒否しました', UNREACHABLE: '画像サービスに接続できません', TIMEOUT: '設定された待機時間を超えました', INTERRUPTED: '待機または実行が中断されました', REJECTED: 'ワークフローまたはパラメーターが受理されませんでした', FAILED: 'この処理を完了できませんでした', EMPTY: '有効な画像が返されませんでした', INVALID_RESPONSE: '応答形式が正しくありません' },
    fields: { sourceImage: '元画像', workflow: 'ワークフロー JSON', checkpoint: 'Checkpoint', sampler: 'サンプラー', scheduler: 'スケジューラー', vae: 'VAE', lora: 'LoRA', upscaler: '拡大モデル', timeoutSeconds: 'タイムアウト', connectionId: '接続', seed: 'シード', mode: '生成モード' },
    actions: { sourceImage: '有効な画像を選択するか、上流の出力設定を確認してください', workflow: 'サービス側のノードと出力を確認し、API 形式の JSON を使用してください', checkpoint: '一覧を更新し、インストール済みの Checkpoint を選択してください', sampler: '検出された一覧から対応するサンプラーを選択してください', scheduler: '検出された一覧から対応するスケジューラーを選択してください', vae: 'VAE のインストール状態とモデルとの互換性を確認してください', lora: 'LoRA の名前とモデルの組み合わせを確認してください', upscaler: '一覧を更新し、インストール済みの拡大モデルを選択してください', timeoutSeconds: 'キューとモデルの状態を確認してから待機時間を調整してください', connectionId: '接続テストでバックエンドから起動済みサービスへの接続を確認してください', seed: '-1 または有効な非負整数を指定してください', mode: 'サービスが対応する生成モードを選択してください' },
  },
}
