<script setup lang="ts">
import { FolderKanban, Play, Plus, RotateCcw, Save, Workflow } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { toApiError } from '@/api/client/apiError'
import { workflowApi } from '@/services/api/workflowApi'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const workflowStore = useWorkflowStore()
const runStore = useRunStore()
const fileStore = useFileStore()
const projectStore = useProjectStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const showCopilot = ref(false)
const showRunConsole = ref(false)
const startingRun = ref(false)

const hasWorkflowContext = computed(() => {
  return String(route.params.id || '') !== 'new'
    || Boolean(routeQueryString(route.query.projectId))
    || Boolean(routeQueryString(route.query.name))
})
const shouldShowEmptyWorkflowGuide = computed(() => {
  return !hasWorkflowContext.value
})

function routeQueryString(value: unknown) {
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

async function loadRouteWorkflow(workflowId: string) {
  const projectId = routeQueryString(route.query.projectId)
  await workflowStore.loadWorkflow(workflowId, {
    initialName: routeQueryString(route.query.name),
  })
  if (projectId) {
    projectStore.selectProject(projectId)
  } else {
    projectStore.selectProjectByWorkflow(workflowId)
  }
  if (runStore.currentRun?.workflowId === workflowId) {
    runStore.currentRun.nodeStates.forEach((node) => {
      workflowStore.updateNodeStatus(node.nodeId, node.status, node.durationMs)
    })
  }
  const selectedNodeStillExists = workflowStore.nodes.some((node) => node.id === uiStore.selectedNodeId)
  if (!selectedNodeStillExists) {
    uiStore.setSelectedNode(workflowStore.nodes[0]?.id ?? null)
  }
}

onMounted(async () => {
  await Promise.all([projectStore.loadProjects(), runStore.loadRuns(), fileStore.loadFiles()])
  if (!hasWorkflowContext.value) {
    workflowStore.resetMockWorkflow()
    return
  }
  await loadRouteWorkflow(String(route.params.id || 'new'))
  runStore.subscribeCurrentRun()
})

watch(
  () => [route.params.id, route.query.projectId, route.query.name],
  async ([workflowId]) => {
    if (!hasWorkflowContext.value) {
      workflowStore.resetMockWorkflow()
      showCopilot.value = false
      showRunConsole.value = false
      return
    }
    await loadRouteWorkflow(String(workflowId || 'new'))
  },
)

async function saveWorkflow() {
  try {
    const beforeWorkflowId = workflowStore.workflowId
    const projectId = routeQueryString(route.query.projectId) ?? projectStore.currentProject?.id
    await workflowStore.saveCurrentWorkflow()
    if (projectId) {
      projectStore.linkWorkflowToProject(projectId, workflowStore.workflowId)
    }
    if (beforeWorkflowId !== workflowStore.workflowId) {
      await router.replace({
        path: `/workflows/${workflowStore.workflowId}`,
        query: projectId ? { projectId } : undefined,
      })
    }
    projectStore.updateWorkflowStatus(workflowStore.workflowId, 'ready')
  } catch {
    // The store exposes the localized save error for the page banner.
  }
}

function selectedInputFileId() {
  const startNode = workflowStore.nodes.find((node) => node.data.kind === 'start')
  const configuredFileId = startNode?.data.config.fileId
  return configuredFileId === undefined || configuredFileId === null || configuredFileId === ''
    ? undefined
    : String(configuredFileId)
}

function runErrorMessage(error: unknown) {
  const apiError = toApiError(error, 'workflow')
  const details = [apiError.message, apiError.traceId ? `traceId=${apiError.traceId}` : undefined]
    .filter(Boolean)
    .join(' · ')
  return details || t('workflow.runFailedUnknown')
}

async function startRun() {
  if (startingRun.value || workflowStore.saving) {
    return
  }

  startingRun.value = true
  workflowStore.setRunError(null)
  try {
    await runStore.loadRuns()
    await fileStore.loadFiles()
    const fileId = selectedInputFileId() ?? fileStore.latestBackendInputFileId
    if (!fileId) {
      workflowStore.setRunError(t('workflow.runRequiresFileId'))
      return
    }

    const projectId = routeQueryString(route.query.projectId) ?? projectStore.currentProject?.id
    const beforeWorkflowId = workflowStore.workflowId
    await workflowStore.saveCurrentWorkflow({ allowMockFallback: false })
    if (projectId) {
      projectStore.linkWorkflowToProject(projectId, workflowStore.workflowId)
    }
    if (beforeWorkflowId !== workflowStore.workflowId) {
      await router.replace({
        path: `/workflows/${workflowStore.workflowId}`,
        query: projectId ? { projectId } : undefined,
      })
    }
    if (!workflowStore.backendDefinitionId) {
      workflowStore.setRunError(t('workflow.runRequiresBackendDefinition'))
      return
    }
    const result = await workflowApi.startRun(
      workflowStore.workflowId,
      { fileId },
      { allowMockFallback: false },
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
  } catch (error) {
    workflowStore.setRunError(`${t('workflow.runFailed')}: ${runErrorMessage(error)}`)
  } finally {
    startingRun.value = false
  }
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
  <section v-if="shouldShowEmptyWorkflowGuide" class="grid h-full place-items-center bg-app-bg px-6">
    <div class="w-full max-w-3xl overflow-hidden rounded-2xl border border-app-border bg-white shadow-panel">
      <div class="border-b border-app-border bg-gradient-to-r from-primary/8 via-white to-white px-8 py-7">
        <div class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-node">
          <Workflow class="h-6 w-6" />
        </div>
        <p class="mt-5 text-2xl font-semibold tracking-tight text-text-primary">
          {{ t('workflow.emptyTitle') }}
        </p>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          {{ t('workflow.emptyHint') }}
        </p>
      </div>

      <div class="grid gap-4 p-6 md:grid-cols-2">
        <RouterLink
          to="/projects"
          class="group rounded-xl border border-app-border bg-app-bg2 p-5 transition hover:border-primary/30 hover:bg-primary-soft/50"
        >
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-white text-primary shadow-sm">
              <FolderKanban class="h-5 w-5" />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.emptyOpenProjects') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('workflow.emptyOpenProjectsHint') }}</p>
            </div>
          </div>
        </RouterLink>

        <RouterLink
          to="/projects"
          class="group rounded-xl border border-primary/20 bg-primary px-5 py-5 text-white shadow-node transition hover:bg-primary-dark"
        >
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-white/15">
              <Plus class="h-5 w-5" />
            </span>
            <div>
              <p class="text-sm font-semibold">{{ t('workflow.emptyCreateWorkflow') }}</p>
              <p class="mt-1 text-xs text-white/75">{{ t('workflow.emptyCreateWorkflowHint') }}</p>
            </div>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>

  <section v-else class="grid h-full grid-rows-[auto_minmax(0,1fr)]">
    <header class="flex flex-col gap-3 border-b border-app-border bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text-primary">{{ workflowStore.workflowName }}</p>
        <p class="truncate text-xs text-text-muted">{{ t('workflow.mockWorkflow') }} · {{ workflowStore.nodes.length }} {{ t('common.nodes') }} · {{ workflowStore.edges.length }} {{ t('common.edges') }}</p>
        <p v-if="workflowStore.savingError || workflowStore.runError" class="mt-2 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-xs font-medium text-status-error">
          {{ workflowStore.savingError || workflowStore.runError }}
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
        <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node hover:bg-primary-dark disabled:opacity-60" :disabled="startingRun || workflowStore.saving" @click="startRun">
          <Play class="h-4 w-4" />
          {{ startingRun ? t('workflow.startingRun') : t('workflow.run') }}
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
