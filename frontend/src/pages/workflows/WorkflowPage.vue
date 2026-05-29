<script setup lang="ts">
import { Play, RotateCcw, Save } from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { workflowApi } from '@/services/api/workflowApi'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const workflowStore = useWorkflowStore()
const runStore = useRunStore()
const fileStore = useFileStore()
const projectStore = useProjectStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const showCopilot = ref(false)
const showRunConsole = ref(false)

async function loadRouteWorkflow(workflowId: string) {
  await workflowStore.loadWorkflow(workflowId)
  projectStore.selectProjectByWorkflow(workflowId)
  if (runStore.currentRun?.workflowId === workflowId) {
    runStore.currentRun.nodeStates.forEach((node) => {
      workflowStore.updateNodeStatus(node.nodeId, node.status, node.durationMs)
    })
  }
}

onMounted(async () => {
  await Promise.all([projectStore.loadProjects(), runStore.loadRuns(), fileStore.loadFiles()])
  await loadRouteWorkflow(String(route.params.id || 'wf-media-digest'))
  runStore.subscribeCurrentRun()
})

watch(
  () => route.params.id,
  async (workflowId) => {
    await loadRouteWorkflow(String(workflowId || 'wf-media-digest'))
  },
)

async function saveWorkflow() {
  try {
    await workflowStore.saveCurrentWorkflow()
    projectStore.updateWorkflowStatus(workflowStore.workflowId, 'ready')
  } catch {
    // The store exposes the localized save error for the page banner.
  }
}

async function startRun() {
  await runStore.loadRuns()
  await fileStore.loadFiles()
  const fileId = fileStore.latestBackendInputFileId
  const result = await workflowApi.startRun(
    workflowStore.workflowId,
    fileId ? { fileId } : {},
  )
  const run = runStore.createRunFromWorkflow({
    runId: result.runId,
    workflowId: workflowStore.workflowId,
    workflowName: workflowStore.workflowName,
    nodes: workflowStore.nodes,
    backendInstanceId: result.backendInstanceId,
    runtimeWorkflowId: result.runtimeWorkflowId,
    definitionId: result.definitionId,
    backendStatus: result.backendStatus,
  })
  projectStore.updateWorkflowStatus(workflowStore.workflowId, 'running')
  runStore.subscribeCurrentRun()
  await router.push(`/runs/${run.id}`)
}

function openCopilot() {
  showRunConsole.value = false
  showCopilot.value = true
}

function openRunConsole() {
  showCopilot.value = false
  showRunConsole.value = true
}
</script>

<template>
  <section class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
    <header class="flex flex-col gap-3 border-b border-app-border bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text-primary">{{ workflowStore.workflowName }}</p>
        <p class="truncate text-xs text-text-muted">{{ t('workflow.mockWorkflow') }} · {{ workflowStore.nodes.length }} {{ t('common.nodes') }} · {{ workflowStore.edges.length }} {{ t('common.edges') }}</p>
        <p v-if="workflowStore.savingError" class="mt-2 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-xs font-medium text-status-error">
          {{ workflowStore.savingError }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:text-primary" @click="workflowStore.resetMockWorkflow()">
          <RotateCcw class="h-4 w-4" />
          {{ t('workflow.reset') }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft disabled:opacity-60" :disabled="workflowStore.saving" @click="saveWorkflow">
          <Save class="h-4 w-4" />
          {{ workflowStore.saving ? t('workflow.saving') : workflowStore.dirty ? t('workflow.saveMock') : t('workflow.saved') }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node hover:bg-primary-dark" @click="startRun">
          <Play class="h-4 w-4" />
          {{ t('workflow.run') }}
        </button>
      </div>
    </header>

    <div class="relative grid min-h-0 min-w-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <WorkflowCanvas />
      <NodeInspector @open-copilot="openCopilot" @open-logs="openRunConsole" />

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-6 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-6 opacity-0"
      >
        <div v-if="showCopilot" class="absolute inset-y-0 right-0 z-30 w-[min(390px,calc(100%-1rem))] border-l border-app-border bg-white shadow-panel">
          <AICopilotPanel @close="showCopilot = false" />
        </div>
      </Transition>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-6 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-6 opacity-0"
      >
        <div v-if="showRunConsole" class="absolute bottom-4 right-4 top-4 z-20 w-[min(520px,calc(100%-2rem))] overflow-hidden rounded-xl shadow-panel">
          <RunConsole @close="showRunConsole = false" />
        </div>
      </Transition>
    </div>
  </section>
</template>
