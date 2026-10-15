<script setup lang="ts">
import { PanelRightClose, Play } from 'lucide-vue-next'
import { computed, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import ImageExecutionFailureCard from '@/components/run/ImageExecutionFailureCard.vue'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useUiStore } from '@/stores/uiStore'
import { workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import { parseImageExecutionFailure, type ImageExecutionFailure } from '@/utils/imageExecutionFailure'

const runStore = useRunStore()
const workflowStore = useWorkflowStore()
const uiStore = useUiStore()
const visibleLogs = computed(() => runStore.logs.slice(-24).map((log) => ({ ...log, imageFailure: log.imageFailure ?? parseImageExecutionFailure(log.message) })))
const { t } = useI18n()
const emit = defineEmits<{
  close: []
}>()

function canLocate(nodeId: string | undefined) {
  return Boolean(nodeId && runStore.currentRun
    && workflowRunBelongsToWorkflow(runStore.currentRun, workflowStore.workflowId, workflowStore.backendDefinitionId)
    && workflowStore.nodes.some((node) => node.id === nodeId && ['image-generation', 'upscale'].includes(node.data.kind)))
}

async function locate(nodeId: string | undefined, failure: ImageExecutionFailure) {
  if (!nodeId || !canLocate(nodeId)) return
  const runId = runStore.currentRun?.id
  workflowStore.nodes.forEach((node) => { node.selected = node.id === nodeId })
  uiStore.setSelectedNode(nodeId)
  await nextTick()
  // 节点和运行切换后，旧日志的异步定位不能抢走新选择的焦点。
  if (runStore.currentRun?.id !== runId || uiStore.selectedNodeId !== nodeId || !canLocate(nodeId)) return
  if (requestNodeConfigFieldFocus(nodeId, failure.field)) emit('close')
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-sidebar text-text-inverse">
    <div class="flex h-12 items-center justify-between border-b border-white/10 px-4">
      <div class="flex items-center gap-3">
        <Play class="h-4 w-4 text-primary" />
        <span class="text-sm font-semibold">{{ t('workflow.runConsole') }}</span>
        <StatusBadge v-if="runStore.currentRun" :status="runStore.currentRun.status" />
      </div>
      <button type="button" class="grid h-8 w-8 place-items-center rounded text-slate-300 hover:bg-sidebar-soft" :title="t('common.close')" :aria-label="t('common.close')" @click="emit('close')">
        <PanelRightClose class="h-4 w-4" />
      </button>
    </div>

    <div class="border-b border-white/10 p-4">
      <p class="text-xs text-slate-400">{{ t('workflow.currentRun') }}</p>
      <p class="mt-1 truncate text-sm font-semibold">{{ runStore.currentRun?.id ?? t('workflow.noRunSelected') }}</p>
      <p class="mt-2 text-xs text-slate-400">{{ runStore.currentRun?.workflowName ?? t('workflow.loadRunHint') }}</p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-6">
      <p v-if="runStore.logsLoading" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.loading') }}
      </p>
      <p v-else-if="visibleLogs.length === 0" class="rounded bg-white/5 px-2 py-1 text-slate-400">
        {{ t('runs.noLogs') }}
      </p>
      <div
        v-for="log in visibleLogs"
        :key="`${runStore.currentRun?.id ?? ''}:${log.id}`"
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
