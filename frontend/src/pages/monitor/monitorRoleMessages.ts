const messages = {
  'zh-CN': {
    reviewSelectionHint: '选择事件查看追踪详情；这里只查看，不会提交人工复核。', reviewSelected: '已选中',
    reviewCountUnknown: '数量待确认', reviewLoading: '正在获取待复核事件…',
    reviewRefreshing: '正在刷新待复核事件，暂时显示上次结果。',
    reviewUnavailable: '待复核状态暂时无法确认，请使用“刷新平台状态”重试。', reviewEmpty: '当前没有待复核事件',
    title: '平台状态', subtitle: '共享服务的运维状态；个人运行与结果请到我的工作台',
    available: '已获取', forbidden: '当前账号无权读取，请确认管理员权限', unavailable: '暂时无法获取，请重试',
    unavailableTelemetry: '部分服务遥测暂时不可用；未知值不会按零或正常状态展示。',
    noEvents: '当前没有服务事件', loading: '正在获取服务事件…', retry: '重试此项', refresh: '刷新平台状态',
    resources: { workflowNode: '工作流节点', embedding: '向量化', ocr: '文字识别', queue: '任务队列', fileStatus: '文件服务状态', fileMetrics: '文件服务指标', authStatus: '账号服务状态', authMetrics: '账号服务指标', gateway: '网关' },
  },
  'en-US': {
    reviewSelectionHint: 'Select an event to view its trace. Viewing does not submit a manual review.', reviewSelected: 'Selected',
    reviewCountUnknown: 'Count not confirmed', reviewLoading: 'Loading events that need review…',
    reviewRefreshing: 'Refreshing review events. The previous results remain visible.',
    reviewUnavailable: 'Review status is not confirmed. Use “Refresh platform status” to retry.', reviewEmpty: 'No events need review',
    title: 'Platform status', subtitle: 'Shared service operations. Open your workbench for personal runs and results.',
    available: 'Loaded', forbidden: 'Your account cannot read this data. Check administrator access.', unavailable: 'Temporarily unavailable. Try again.',
    unavailableTelemetry: 'Some service telemetry is unavailable. Unknown values are not reported as zero or healthy.',
    noEvents: 'No service events to display', loading: 'Loading service events…', retry: 'Retry this source', refresh: 'Refresh platform status',
    resources: { workflowNode: 'Workflow nodes', embedding: 'Embedding', ocr: 'OCR', queue: 'Task queue', fileStatus: 'File service status', fileMetrics: 'File service metrics', authStatus: 'Account service status', authMetrics: 'Account service metrics', gateway: 'Gateway' },
  },
  'ja-JP': {
    reviewSelectionHint: 'イベントを選択してトレースを確認します。表示しても手動レビューは送信されません。', reviewSelected: '選択中',
    reviewCountUnknown: '件数は未確認', reviewLoading: '確認待ちのイベントを取得中…',
    reviewRefreshing: '確認待ちのイベントを更新中です。前回の結果を表示しています。',
    reviewUnavailable: '確認待ちの状態は未確認です。「状態を更新」から再試行してください。', reviewEmpty: '確認待ちのイベントはありません',
    title: 'プラットフォームの状態', subtitle: '共有サービスの運用状態。個人の実行履歴と結果はワークベンチから確認できます。',
    available: '取得済み', forbidden: 'この情報を読み取る権限がありません。管理者権限を確認してください。', unavailable: '現在取得できません。再試行してください。',
    unavailableTelemetry: '一部のサービス指標を取得できません。不明な値をゼロや正常として表示しません。',
    noEvents: 'サービスイベントはありません', loading: 'サービスイベントを取得中…', retry: 'この項目を再試行', refresh: '状態を更新',
    resources: { workflowNode: 'ワークフローノード', embedding: '埋め込み', ocr: '文字認識', queue: 'タスクキュー', fileStatus: 'ファイルサービス状態', fileMetrics: 'ファイルサービス指標', authStatus: '認証サービス状態', authMetrics: '認証サービス指標', gateway: 'ゲートウェイ' },
  },
}
export function monitorRoleMessages(locale: string) {
  return messages[locale as keyof typeof messages] ?? messages['en-US']
}
