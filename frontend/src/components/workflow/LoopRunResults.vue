<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getBatchResults, type BatchRunResult } from '@/api/modules/runtime'
const props = defineProps<{ instanceId?: string | number; nodeId: string; runStatus?: string }>()
const { t } = useI18n({ useScope: 'local', messages: {
  'zh-CN': {
    title: '逐项结果', refresh: '刷新', previousPage: '上一页', nextPage: '下一页',
    loading: '正在加载…', refreshing: '正在刷新，显示上次读取的结果…',
    readFailed: '批次结果暂时无法加载，请重试',
    readFailedWithResults: '批次结果暂时无法加载，请重试；显示上次读取的结果',
    empty: '运行后在这里查看每项状态和输出',
    itemSummary: '第 {index} 项 · {status}', inputItem: '输入项', outputVariables: '输出变量',
  },
  'en-US': {
    title: 'Item results', refresh: 'Refresh', previousPage: 'Previous page', nextPage: 'Next page',
    loading: 'Loading…', refreshing: 'Refreshing. Showing the last loaded results…',
    readFailed: 'Could not load item results. Please retry.',
    readFailedWithResults: 'Could not load item results. Please retry. Showing the last loaded results.',
    empty: 'After running, check each item’s status and output here.',
    itemSummary: 'Item {index} · {status}', inputItem: 'Input item', outputVariables: 'Output variables',
  },
  'ja-JP': {
    title: '項目別の結果', refresh: '更新', previousPage: '前のページ', nextPage: '次のページ',
    loading: '読み込み中…', refreshing: '更新中です。前回読み込んだ結果を表示しています…',
    readFailed: '項目別の結果を読み込めませんでした。再試行してください。',
    readFailedWithResults: '項目別の結果を読み込めませんでした。再試行してください。前回読み込んだ結果を表示しています。',
    empty: '実行後、各項目の状態と出力をここで確認できます。',
    itemSummary: '{index} 件目 · {status}', inputItem: '入力項目', outputVariables: '出力変数',
  },
} })
const PAGE_SIZE = 50
const rows = ref<BatchRunResult[]>([])
const total = ref<number | null>(null)
const offset = ref(0)
const loading = ref(false)
const failed = ref(false)
let generation = 0
async function load(nextOffset = 0, reason: 'scope' | 'page' | 'refresh' = 'scope') {
  const current = ++generation
  const { instanceId, nodeId } = props
  // 只有同一运行、节点和页的刷新才复用已显示条目，保留原有展开状态与焦点。
  if (reason !== 'refresh' || !instanceId) rows.value = []
  // 翻页时保留同一批次最后一次确认的页数，读取失败后仍能返回。
  if (reason === 'scope' || !instanceId) total.value = null
  failed.value = false
  offset.value = nextOffset
  loading.value = Boolean(instanceId)
  if (!instanceId) return
  try {
    const result = await getBatchResults(instanceId, nodeId, nextOffset)
    if (current !== generation) return
    total.value = result.total
    // 并发批次因失败停止后，保留下来的结果可能已不覆盖这一页。
    if (result.total > 0 && nextOffset >= result.total) {
      await load(Math.floor((result.total - 1) / PAGE_SIZE) * PAGE_SIZE, 'page')
      return
    }
    rows.value = result.results
    // 恢复执行时快照可能暂时没有逐项结果，下一次读取仍应使用原页。
    offset.value = result.total === 0 ? nextOffset : result.offset
  } catch { if (current === generation) failed.value = true }
  finally { if (current === generation) loading.value = false }
}
onBeforeUnmount(() => { generation++ })
watch(() => [props.instanceId, props.nodeId, props.runStatus] as const, ([instanceId, nodeId], previous) => {
  const sameBatch = previous?.[0] === instanceId && previous?.[1] === nodeId
  void load(sameBatch ? offset.value : 0, sameBatch ? 'refresh' : 'scope')
}, { immediate: true })
</script>
<template>
  <section class="mt-3 space-y-2 rounded-lg border border-app-border p-3" data-test="loop-run-results">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">{{ t('title') }}<template v-if="total !== null && ((!loading && !failed) || rows.length)"> · {{ total }}</template></h3>
      <button type="button" :disabled="loading" class="text-xs text-primary" @click="load(offset, 'refresh')">{{ t('refresh') }}</button>
    </div>
    <p v-if="failed" role="alert" class="text-xs text-status-error">{{ t(rows.length ? 'readFailedWithResults' : 'readFailed') }}</p>
    <p v-else-if="loading" role="status" class="text-xs text-text-muted">{{ t(rows.length ? 'refreshing' : 'loading') }}</p>
    <p v-else-if="!rows.length" class="text-xs text-text-muted">{{ t('empty') }}</p>
    <details v-for="(row, index) in rows" :key="row.index ?? offset + index" class="rounded border border-app-border p-2 text-xs">
      <summary>{{ t('itemSummary', { index: (row.index ?? offset + index) + 1, status: row.status }) }}</summary>
      <p v-if="row.error" class="mt-2 text-status-error">{{ row.error }}</p>
      <div v-if="row.item !== undefined" class="mt-2 min-w-0">
        <p class="font-medium">{{ t('inputItem') }}</p>
        <pre :aria-label="t('inputItem')" tabindex="0" class="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{{ JSON.stringify(row.item, null, 2) }}</pre>
      </div>
      <div v-if="row.variables != null || row.item === undefined" class="mt-2 min-w-0">
        <p class="font-medium">{{ t('outputVariables') }}</p>
        <pre :aria-label="t('outputVariables')" tabindex="0" class="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">{{ JSON.stringify(row.variables ?? {}, null, 2) }}</pre>
      </div>
    </details>
    <div v-if="total !== null && total > PAGE_SIZE" class="flex justify-between text-xs">
      <button type="button" :disabled="loading || offset === 0" @click="load(Math.max(0, offset - PAGE_SIZE), 'page')">{{ t('previousPage') }}</button>
      <button type="button" :disabled="loading || offset + PAGE_SIZE >= total" @click="load(offset + PAGE_SIZE, 'page')">{{ t('nextPage') }}</button>
    </div>
  </section>
</template>
