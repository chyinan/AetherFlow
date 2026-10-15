<script setup lang="ts">
import { Search, Terminal } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { RunLogEntry } from '@/types/run'
import { imageExecutionFailureMessages, parseImageExecutionFailure } from '@/utils/imageExecutionFailure'
import ImageExecutionFailureCard from './ImageExecutionFailureCard.vue'

const props = defineProps<{
  logs: RunLogEntry[]
  runId?: string
  workflowId?: string
}>()

const query = ref('')
const level = ref<'all' | RunLogEntry['level']>('all')
const { t } = useI18n()
const { t: failureText } = useI18n({ useScope: 'local', messages: imageExecutionFailureMessages })
const workflowHref = computed(() => props.workflowId ? `/workflows/${encodeURIComponent(props.workflowId)}` : undefined)
const diagnosedLogs = computed(() => props.logs.map((log) => ({ ...log, imageFailure: log.imageFailure ?? parseImageExecutionFailure(log.message) })))

const filteredLogs = computed(() => {
  const text = query.value.trim().toLowerCase()
  return diagnosedLogs.value.filter((log) => {
    const matchesLevel = level.value === 'all' || log.level === level.value
    const failure = log.imageFailure
    const diagnosticText = failure ? [failure.provider, failure.stage, failure.field, failure.reason,
      failureText(`stages.${failure.stage}`), failureText(`reasons.${failure.reason}`),
      failureText(`actions.${failure.field}`), failureText(`fields.${failure.field}`)].join(' ') : ''
    const matchesText = !text || `${log.message} ${log.nodeId ?? ''} ${diagnosticText}`.toLowerCase().includes(text)
    return matchesLevel && matchesText
  })
})
</script>

<template>
  <section class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-app-border bg-white shadow-sm">
    <div class="flex min-w-0 items-center justify-between gap-3 border-b border-app-border p-4">
      <div class="flex min-w-0 items-center gap-2">
        <span class="grid h-7 w-7 place-items-center rounded-md bg-primary-soft text-primary">
          <Terminal class="h-4 w-4" />
        </span>
        <div>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.runLogs') }}</p>
          <p class="text-xs text-text-muted">{{ t('runs.logStreamHint') }}</p>
        </div>
      </div>
      <select v-model="level" :aria-label="failureText('levelFilter')" class="shrink-0 rounded-md border border-app-border bg-white px-2 py-1 text-xs text-text-secondary outline-none transition focus:border-primary/40">
        <option value="all">{{ t('common.all') }}</option>
        <option value="info">{{ t('common.info') }}</option>
        <option value="debug">{{ t('common.debug') }}</option>
        <option value="warn">{{ t('common.warn') }}</option>
        <option value="error">{{ t('common.error') }}</option>
      </select>
    </div>

    <label class="mx-4 mt-4 flex min-w-0 items-center gap-2 rounded-md border border-app-border bg-app-bg2 px-3 py-2 text-sm transition focus-within:border-primary/40 focus-within:bg-white">
      <Search class="h-4 w-4 shrink-0 text-text-muted" />
      <input v-model="query" class="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted" :placeholder="t('workflow.searchLogs')" :aria-label="t('workflow.searchLogs')" />
    </label>

    <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden overscroll-contain p-4 font-mono text-xs leading-6">
      <p v-if="filteredLogs.length === 0" class="rounded-md border border-dashed border-app-border bg-app-bg2 px-3 py-3 font-sans text-sm text-text-muted">
        {{ t('runs.noLogs') }}
      </p>
      <div
        v-for="log in filteredLogs"
        :key="`${runId ?? ''}:${log.id}`"
        class="grid grid-cols-[68px_52px_minmax(72px,120px)_minmax(0,1fr)] gap-2 rounded-md border border-transparent bg-app-bg2 px-3 py-2 text-text-secondary transition hover:border-primary/20 hover:bg-primary-soft/30"
        :title="log.imageFailure ? undefined : log.message"
      >
        <span class="text-text-muted">{{ log.time }}</span>
        <span class="font-semibold uppercase text-primary">{{ log.level }}</span>
        <span class="truncate text-text-muted">{{ log.nodeId }}</span>
        <ImageExecutionFailureCard v-if="log.imageFailure" :failure="log.imageFailure" :node-id="log.nodeId" :workflow-href="workflowHref" class="text-text-primary" />
        <span v-else class="whitespace-pre-wrap break-words text-text-primary [overflow-wrap:anywhere]">{{ log.message }}</span>
      </div>
    </div>
  </section>
</template>
