export const runHistoryMessages = {
  'zh-CN': {
    search: '本页名称 / 运行 ID', searchHint: '名称和 ID 关键词只搜索已加载的这一页；工作流和状态筛选由服务器执行',
    workflow: '工作流 ID', workflowHint: '留空显示全部工作流，可输入完整工作流 ID', all: '全部状态', status: '运行状态', apply: '应用筛选', clear: '清除筛选',
    openId: '按完整运行 ID 打开', idHint: '例如 run-123 或 123，不受列表筛选限制', open: '打开运行', invalidId: '请输入有效的完整运行 ID，例如 run-123 或 123',
    scope: '以下数量仅统计当前页', page: '第 {page} 页 / 共 {pages} 页 · 筛选结果共 {total} 条', size: '每页条数', previous: '上一页', next: '下一页',
    noMatch: '本页没有匹配结果。可清除关键词或翻页；这不表示其他页没有匹配运行', empty: '当前工作流 / 状态条件下没有运行记录', outside: '当前打开的运行不在这一页的筛选结果中；详情仍可独立查看',
    loading: '正在加载这一页…', error: '这一页加载失败，未显示旧筛选结果', retry: '重试此页', stale: '页码已超出当前结果范围', first: '返回第一页', detailLoading: '正在加载目标运行…',
  },
  'en-US': {
    search: 'Name / run ID on this page', searchHint: 'Name and ID keywords search only this loaded page. Workflow and status filters run on the server',
    workflow: 'Workflow ID', workflowHint: 'Leave blank for all workflows, or enter the full workflow ID', all: 'All statuses', status: 'Run status', apply: 'Apply filters', clear: 'Clear filters',
    openId: 'Open a full run ID', idHint: 'For example, run-123 or 123; independent of list filters', open: 'Open run', invalidId: 'Enter a valid full run ID, for example run-123 or 123',
    scope: 'Counts below cover this page only', page: 'Page {page} of {pages} · {total} filtered runs', size: 'Page size', previous: 'Previous page', next: 'Next page',
    noMatch: 'No matches on this page. Clear the keyword or change pages; other pages may still have matching runs', empty: 'No runs match this workflow / status filter', outside: 'The open run is outside this page’s filtered results. Its details remain available independently',
    loading: 'Loading this page…', error: 'This page failed to load. Previous filter results are hidden', retry: 'Retry page', stale: 'This page is beyond the current result range', first: 'Go to first page', detailLoading: 'Loading the selected run…',
  },
  'ja-JP': {
    search: 'このページの名前 / 実行 ID', searchHint: '名前と ID のキーワードは読み込み済みのこのページのみを検索します。ワークフローと状態はサーバーで絞り込みます',
    workflow: 'ワークフロー ID', workflowHint: '空欄で全ワークフローを表示。完全な ID を入力できます', all: 'すべての状態', status: '実行状態', apply: '絞り込みを適用', clear: '絞り込みを解除',
    openId: '完全な実行 ID で開く', idHint: '例：run-123 または 123。一覧の絞り込みとは独立しています', open: '実行を開く', invalidId: 'run-123 または 123 など、有効な完全な実行 ID を入力してください',
    scope: '以下はこのページのみの件数です', page: '{page} / {pages} ページ · 絞り込み結果 {total} 件', size: '表示件数', previous: '前のページ', next: '次のページ',
    noMatch: 'このページには一致する実行がありません。キーワードを解除するかページを変更してください。他のページには存在する可能性があります', empty: 'このワークフロー / 状態に一致する実行はありません', outside: '表示中の実行はこのページの絞り込み結果に含まれません。詳細は独立して閲覧できます',
    loading: 'このページを読み込み中…', error: 'このページを読み込めません。以前の絞り込み結果は非表示です', retry: 'このページを再試行', stale: 'ページ番号が現在の結果範囲を超えています', first: '最初のページへ', detailLoading: '選択した実行を読み込み中…',
  },
}
