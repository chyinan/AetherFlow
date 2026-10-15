export const runArtifactMessages = {
  'zh-CN': {
    filter: '本次成品 · 运行 {runId}',
    filterHint: '仅显示关联到本次运行的成品文件',
    clear: '清除运行筛选',
    loading: '正在加载本次成品…',
    loadErrorHint: '成品列表加载失败，请重试；当前未显示缓存结果',
    empty: '尚未找到运行 {runId} 的成品文件；运行可能尚未生成文件',
  },
  'en-US': {
    filter: 'Artifacts · Run {runId}',
    filterHint: 'Only artifact files linked to this run are shown',
    clear: 'Clear run filter',
    loading: 'Loading this run’s artifacts…',
    loadErrorHint: 'Artifacts could not be loaded. Retry to see results; cached files are hidden',
    empty: 'No artifact files found for run {runId} yet. The run may not have generated any files',
  },
  'ja-JP': {
    filter: '成果物 · 実行 {runId}',
    filterHint: 'この実行に関連付けられた成果物ファイルのみ表示します',
    clear: '実行の絞り込みを解除',
    loading: 'この実行の成果物を読み込み中…',
    loadErrorHint: '成果物を読み込めません。再試行してください。キャッシュは非表示です',
    empty: '実行 {runId} の成果物ファイルはまだありません。まだファイルが生成されていない可能性があります',
  },
}
