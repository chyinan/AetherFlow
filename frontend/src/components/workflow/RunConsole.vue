<script setup lang="ts">
import { PanelRightClose, Play } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import ImageExecutionFailureCard from '@/components/run/ImageExecutionFailureCard.vue'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import { workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import { parseImageExecutionFailure, type ImageExecutionFailure } from '@/utils/imageExecutionFailure'
import { runConsoleMessages } from './runConsoleMessages'

const runStore = useRunStore()
const workflowStore = useWorkflowStore()
const uiStore = useUiStore()
const props = defineProps<{ lookupRetryBlocked?: boolean }>()
const { t } = useI18n()
const { t: consoleText } = useI18n({ useScope: 'local', messages: runConsoleMessages })
const currentRun = computed(() => {
  const run = runStore.currentRun
  return run && workflowRunBelongsToWorkflow(run, workflowStore.workflowId, workflowStore.backendDefinitionId) ? run : null
})
const visibleLogs = computed(() => currentRun.value
  ? runStore.logs.slice(-24).map((log) => ({ ...log, imageFailure: log.imageFailure ?? parseImageExecutionFailure(log.message) }))
  : [])
const unavailableLogRunId = computed(() => {
  const runId = currentRun.value?.id
  return runId && runStore.logHistoryRetryByRunId[runId] ? runId : undefined
})
const lookupState = computed(() => {
  const lookup = runStore.workflowRunLookup
  if (currentRun.value || !lookup || lookup.workflowId !== workflowStore.workflowId
    || lookup.definitionId !== workflowStore.backendDefinitionId) return null
  return lookup.loading ? 'loading' : 'failed'
})
const retryRequested = ref(false)
const retryButton = ref<HTMLButtonElement | null>(null)
const runSummary = ref<HTMLElement | null>(null)
const showLookupRecovery = computed(() => lookupState.value === 'failed'
  || (lookupState.value === 'loading' && retryRequested.value))
const emit = defineEmits<{
  close: []
  retryLookup: []
}>()

function retryLookup() {
  if (lookupState.value !== 'failed' || props.lookupRetryBlocked) return
  retryRequested.value = true
  emit('retryLookup')
}

watch(lookupState, async (state) => {
  if (state === 'loading') return
  retryRequested.value = false
  // 只有重试按钮仍持有焦点且即将移除时，才移动到当前结果。
  if (state !== null || !retryButton.value || document.activeElement !== retryButton.value) return
  await nextTick()
  const target = runSummary.value
  if (lookupState.value === null && document.activeElement === document.body
    && target?.isConnected && !target.closest('[inert]')) target.focus()
})

function canLocate(nodeId: string | undefined) {
  return Boolean(nodeId && currentRun.value
    && workflowStore.nodes.some((node) => node.id === nodeId && ['image-generation', 'upscale'].includes(node.data.kind)))
}

async function locate(nodeId: string | undefined, failure: ImageExecutionFailure) {
  if (!nodeId || !canLocate(nodeId)) return
  const runId = currentRun.value?.id
  workflowStore.nodes.forEach((node) => { node.selected = node.id === nodeId })
  uiStore.setSelectedNode(nodeId)
  await nextTick()
  // 节点和运行切换后，旧日志的异步定位不能抢走新选择的焦点。
  if (currentRun.value?.id !== runId || uiStore.selectedNodeId !== nodeId || !canLocate(nodeId)) return
  if (requestNodeConfigFieldFocus(nodeId, failure.field)) emit('close')
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-sidebar text-text-inverse">
    <div class="flex h-12 items-center justify-between border-b border-white/10 px-4">
      <div class="flex items-center gap-3">
        <Play class="h-4 w-4 text-primary" />
        <span class="text-sm font-semibold">{{ t('workflow.runConsole') }}</span>
        <StatusBadge v-if="currentRun" :status="currentRun.status" />
      </div>
      <button type="button" class="grid h-8 w-8 place-items-center rounded text-slate-300 hover:bg-sidebar-soft" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')">
        <PanelRightClose class="h-4 w-4" />
      </button>
    </div>

    <div ref="runSummary" tabindex="-1" class="border-b border-white/10 p-4 focus-visible:outline focus-visible:outline-primary">
      <p class="text-xs text-slate-400">{{ t('workflow.currentRun') }}</p>
      <template v-if="!lookupState">
        <p class="mt-1 truncate text-sm font-semibold">{{ currentRun?.id ?? t('workflow.noRunSelected') }}</p>
        <p class="mt-2 text-xs text-slate-400">{{ currentRun?.workflowName ?? t('workflow.loadRunHint') }}</p>
      </template>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-6">
      <div v-if="lookupState" class="rounded bg-white/5 px-2 py-1 text-slate-200">
        <p role="status">{{ consoleText(lookupState === 'loading' ? 'loadingWorkflowRuns' : 'workflowRunsUnavailable') }}</p>
        <button
          v-if="showLookupRecovery"
          ref="retryButton"
          type="button"
          :aria-disabled="lookupState === 'loading' || lookupRetryBlocked || undefined"
          data-testid="run-console-retry-runs"
          class="underline underline-offset-2 aria-disabled:no-underline aria-disabled:opacity-60"
          @click="retryLookup"
        >{{ consoleText('retryWorkflowRuns') }}</button>
      </div>
      <p v-else-if="currentRun && runStore.logsLoading" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.loading') }}
      </p>
      <div v-else-if="unavailableLogRunId" class="mb-2 rounded border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-amber-200">
        <p role="status" data-testid="run-console-saved-logs-unavailable">{{ consoleText('savedLogsUnavailable') }}</p>
        <RouterLink
          :to="{ name: 'run-detail', params: { id: unavailableLogRunId } }"
          data-testid="run-console-log-history"
          class="inline-block underline underline-offset-2"
        >{{ consoleText('openRunDetails') }}</RouterLink>
      </div>
      <p v-else-if="visibleLogs.length === 0" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.noLogs') }}
      </p>
      <div
        v-for="log in visibleLogs"
        :key="`${currentRun?.id ?? ''}:${log.id}`"
        class="grid grid-cols-[64px_44px_minmax(0,1fr)] gap-2 rounded px-2 py-1.5 text-slate-300 hover:bg-white/5"
      >
        <span class="text-slate-500">{{ log.time }}</span>
        <span class="text-primary">{{ log.level }}</span>
        <ImageExecutionFailureCard v-if="log.imageFailure" :failure="log.imageFailure" :node-id="log.nodeId" :can-locate="canLocate(log.nodeId)" dark @locate="locate(log.nodeId, log.imageFailure)" />
        <span v-else class="break-words">{{ log.message }}</span>
      </div>
    </div>
  </section>
</template>
