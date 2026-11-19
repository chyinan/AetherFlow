<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { getBatchResults, type BatchRunResult } from '@/api/modules/runtime'
const props = defineProps<{ instanceId?: string | number; nodeId: string; runStatus?: string }>()
const PAGE_SIZE = 50
const rows = ref<BatchRunResult[]>([])
const total = ref<number | null>(null)
const offset = ref(0)
const loading = ref(false)
const error = ref('')
let generation = 0
async function load(nextOffset = 0, reason: 'scope' | 'page' | 'refresh' = 'scope') {
  const current = ++generation
  const { instanceId, nodeId } = props
  // 只有同一运行、节点和页的刷新才复用已显示条目，保留原有展开状态与焦点。
  if (reason !== 'refresh' || !instanceId) rows.value = []
  // 翻页时保留同一批次最后一次确认的页数，读取失败后仍能返回。
  if (reason === 'scope' || !instanceId) total.value = null
  error.value = ''
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
  } catch { if (current === generation) error.value = '批次结果暂时无法加载，请重试' }
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
    <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">逐项结果<template v-if="total !== null && ((!loading && !error) || rows.length)"> · {{ total }}</template></h3><button type="button" :disabled="loading" class="text-xs text-primary" @click="load(offset, 'refresh')">刷新</button></div>
    <p v-if="error" role="alert" class="text-xs text-status-error">{{ error }}<span v-if="rows.length">；显示上次读取的结果</span></p>
    <p v-else-if="loading" role="status" class="text-xs text-text-muted">{{ rows.length ? '正在刷新，显示上次读取的结果…' : '正在加载…' }}</p>
    <p v-else-if="!rows.length" class="text-xs text-text-muted">运行后在这里查看每项状态和输出</p>
    <details v-for="(row, index) in rows" :key="row.index ?? offset + index" class="rounded border border-app-border p-2 text-xs">
      <summary>第 {{ (row.index ?? offset + index) + 1 }} 项 · {{ row.status }}</summary>
      <p v-if="row.error" class="mt-2 text-status-error">{{ row.error }}</p>
      <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{{ JSON.stringify(row.variables ?? row.item ?? {}, null, 2) }}</pre>
    </details>
    <div v-if="total !== null && total > PAGE_SIZE" class="flex justify-between text-xs"><button type="button" :disabled="loading || offset === 0" @click="load(Math.max(0, offset - PAGE_SIZE), 'page')">上一页</button><button type="button" :disabled="loading || offset + PAGE_SIZE >= total" @click="load(offset + PAGE_SIZE, 'page')">下一页</button></div>
  </section>
</template>
