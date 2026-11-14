<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { listWorkflowChildRuns, type WorkflowChildRunSummary } from '@/api/modules/workflow'
import { subworkflowChildRunMessages } from './subworkflowChildRunMessages'

const props = defineProps<{ instanceId: number }>()
const route = useRoute()
const { t } = useI18n({ useScope: 'local', messages: subworkflowChildRunMessages })
const expanded = ref(false)
const loading = ref(false)
const error = ref(false)
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
  error.value = false
  try {
    const result = await listWorkflowChildRuns(props.instanceId, request.signal)
    if (active && expanded.value && token === generation) records.value = result
  } catch {
    if (active && expanded.value && token === generation) error.value = true
  } finally {
    if (active && token === generation) loading.value = false
  }
}
function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) void load()
  else invalidate()
}
watch(() => props.instanceId, () => { invalidate(); expanded.value = false; records.value = []; error.value = false })
onBeforeUnmount(() => { active = false; invalidate() })
</script>

<template>
  <section class="mt-4 border-t border-app-border pt-3" :aria-label="t('section')">
    <div class="flex items-center justify-between gap-3">
      <button type="button" data-testid="toggle-child-runs" class="text-sm font-medium text-primary" :aria-expanded="expanded" @click="toggle">
        {{ expanded ? t('hide') : t('show') }}
      </button>
      <button v-if="expanded" type="button" data-testid="refresh-child-runs" class="text-xs text-primary disabled:opacity-50" :disabled="loading" @click="load">
        {{ loading ? t('loading') : t('refresh') }}
      </button>
    </div>
    <div v-if="expanded" class="mt-3 max-h-64 space-y-2 overflow-y-auto">
      <p class="text-xs leading-5 text-text-muted">{{ t('parentNote') }}</p>
      <p v-if="error" role="alert" class="text-xs text-status-error">{{ t('loadFailed') }}</p>
      <p v-if="!loading && !error && !records.length" class="text-xs text-text-muted">{{ t('empty') }}</p>
      <article v-for="record in records" :key="`${record.parentNodeId}:${record.childInstanceId}`" class="rounded-md border border-app-border bg-app-bg2 p-3 text-xs">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <RouterLink :to="{ path: `/runs/run-${record.childInstanceId}`, query: route.query }" class="font-semibold text-primary underline" data-testid="child-run-link">{{ t('childRun', { id: record.childInstanceId }) }}</RouterLink>
          <span>{{ record.reused ? t('reused') : record.status === 'COMPLETED' ? t('processed') : t('waiting') }}</span>
        </div>
        <p class="mt-2 break-all text-text-secondary">{{ record.parentNodeId }} · {{ t('definition') }} #{{ record.definitionId }} · {{ t('version', { version: record.definitionVersion }) }}</p>
        <RouterLink v-if="record.reused && record.sourceParentInstanceId" :to="{ path: `/runs/run-${record.sourceParentInstanceId}`, query: route.query }" class="mt-2 inline-block text-primary underline" data-testid="source-run-link">{{ t('sourceParent', { id: record.sourceParentInstanceId }) }}</RouterLink>
      </article>
    </div>
  </section>
</template>
