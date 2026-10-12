<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { getBatchResults, type BatchRunResult } from '@/api/modules/runtime'
const props = defineProps<{ instanceId?: string | number; nodeId: string; runStatus?: string }>()
const rows = ref<BatchRunResult[]>([])
const total = ref(0)
const offset = ref(0)
const loading = ref(false)
const error = ref('')
let generation = 0
async function load(nextOffset = 0) {
  const current = ++generation
  rows.value = []; total.value = 0; loading.value = false; error.value = ''; offset.value = nextOffset
  if (!props.instanceId) { total.value = 0; return }
  loading.value = true
  try {
    const result = await getBatchResults(props.instanceId, props.nodeId, nextOffset)
    if (current !== generation) return
    rows.value = result.results; total.value = result.total; offset.value = result.offset
  } catch { if (current === generation) error.value = '批次结果暂时无法加载，请重试' }
  finally { if (current === generation) loading.value = false }
}
onBeforeUnmount(() => { generation++ })
watch(() => [props.instanceId, props.nodeId, props.runStatus], () => { void load() }, { immediate: true })
</script>
<template>
  <section class="mt-3 space-y-2 rounded-lg border border-app-border p-3" data-test="loop-run-results">
    <div class="flex items-center justify-between"><h3 class="text-sm font-semibold">逐项结果 · {{ total }}</h3><button type="button" :disabled="loading" class="text-xs text-primary" @click="load(offset)">刷新</button></div>
    <p v-if="error" role="alert" class="text-xs text-status-error">{{ error }}</p>
    <p v-else-if="loading" class="text-xs text-text-muted">正在加载…</p>
    <p v-else-if="!rows.length" class="text-xs text-text-muted">运行后在这里查看每项状态和输出</p>
    <details v-for="(row, index) in rows" :key="row.index ?? offset + index" class="rounded border border-app-border p-2 text-xs">
      <summary>第 {{ (row.index ?? offset + index) + 1 }} 项 · {{ row.status }}</summary>
      <p v-if="row.error" class="mt-2 text-status-error">{{ row.error }}</p>
      <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{{ JSON.stringify(row.variables ?? row.item ?? {}, null, 2) }}</pre>
    </details>
    <div v-if="total > 50" class="flex justify-between text-xs"><button type="button" :disabled="loading || offset === 0" @click="load(Math.max(0, offset - 50))">上一页</button><button type="button" :disabled="loading || offset + 50 >= total" @click="load(offset + 50)">下一页</button></div>
  </section>
</template>
