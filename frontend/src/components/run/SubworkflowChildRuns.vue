<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { listWorkflowChildRuns, type WorkflowChildRunSummary } from '@/api/modules/workflow'

const props = defineProps<{ instanceId: number }>()
const expanded = ref(false)
const loading = ref(false)
const error = ref('')
const records = ref<WorkflowChildRunSummary[]>([])
let active = true
let generation = 0
let request: AbortController | null = null
function invalidate() { generation++; request?.abort(); request = null; loading.value = false }
async function load() {
  invalidate()
  const token = generation
  request = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await listWorkflowChildRuns(props.instanceId, request.signal)
    if (active && expanded.value && token === generation) records.value = result
  } catch {
    if (active && expanded.value && token === generation) error.value = '读取子工作流记录失败，请重试'
  } finally {
    if (active && token === generation) loading.value = false
  }
}
function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) void load()
  else invalidate()
}
watch(() => props.instanceId, () => { invalidate(); expanded.value = false; records.value = []; error.value = '' })
onBeforeUnmount(() => { active = false; invalidate() })
</script>

<template>
  <section class="mt-4 border-t border-app-border pt-3" aria-label="子工作流运行记录">
    <div class="flex items-center justify-between gap-3">
      <button type="button" data-testid="toggle-child-runs" class="text-sm font-medium text-primary" :aria-expanded="expanded" @click="toggle">
        {{ expanded ? '收起子工作流记录' : '查看子工作流记录' }}
      </button>
      <button v-if="expanded" type="button" data-testid="refresh-child-runs" class="text-xs text-primary disabled:opacity-50" :disabled="loading" @click="load">
        {{ loading ? '读取中…' : '刷新子运行' }}
      </button>
    </div>
    <div v-if="expanded" class="mt-3 max-h-64 space-y-2 overflow-y-auto">
      <p class="text-xs leading-5 text-text-muted">子运行内单独重跑不会修改此父运行。要继续父流程，请从父流程的失败调用节点或所属循环根发起重跑。</p>
      <p v-if="error" role="alert" class="text-xs text-status-error">{{ error }}</p>
      <p v-if="!loading && !error && !records.length" class="text-xs text-text-muted">当前运行还没有子工作流调用记录</p>
      <article v-for="record in records" :key="`${record.parentNodeId}:${record.childInstanceId}`" class="rounded-md border border-app-border bg-app-bg2 p-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <RouterLink :to="`/runs/run-${record.childInstanceId}`" class="font-semibold text-primary underline" data-testid="child-run-link">打开子运行 #{{ record.childInstanceId }}</RouterLink>
          <span>{{ record.reused ? '复用已完成结果' : record.status === 'COMPLETED' ? '调用已处理' : '等待子流程完成' }}</span>
        </div>
        <p class="mt-2 break-all text-text-secondary">{{ record.parentNodeId }} · 定义 #{{ record.definitionId }} · v{{ record.definitionVersion }}</p>
        <RouterLink v-if="record.reused && record.sourceParentInstanceId" :to="`/runs/run-${record.sourceParentInstanceId}`" class="mt-2 inline-block text-primary underline" data-testid="source-run-link">查看原父运行 #{{ record.sourceParentInstanceId }}</RouterLink>
      </article>
    </div>
  </section>
</template>
