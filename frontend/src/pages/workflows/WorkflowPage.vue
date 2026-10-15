<script setup lang="ts">
// pattern: Imperative Shell
import { Copy, FileJson, FolderKanban, Library, LoaderCircle, PauseCircle, Play, Plus, Redo2, RotateCcw, Save, Undo2, Upload, Workflow, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import WorkflowPreflight from '@/components/workflow/WorkflowPreflight.vue'
import WorkflowStarterGuide from '@/components/workflow/WorkflowStarterGuide.vue'
import { preflightMessages } from '@/components/workflow/preflightMessages'
import { buildWorkflowPreflight, type PreflightIssue } from '@/utils/workflowPreflight'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { workflowStartIntent } from '@/utils/workflowStartIntent'
import { toApiError } from '@/api/client/apiError'
import { importComfyUiWorkflow } from '@/api/modules/workflow'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import type { WorkflowCopilotCanvasAction } from '@/services/copilot/workflowCopilotActions'
import type { CopilotWorkflowDraftApplyRequest } from '@/types/copilotWorkflowPlan'
import { workflowApi } from '@/services/api/workflowApi'
import { useFileStore } from '@/stores/fileStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowNodeKind } from '@/types/workflow'
import { workflowRequiresFileInput } from '@/utils/workflowInputRequirements'
import { isActiveWorkflowRun, isWaitingWorkflowRun, workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'

const workflowStore = useWorkflowStore()
const canvasRef = ref<InstanceType<typeof WorkflowCanvas> | null>(null)
const runStore = useRunStore()
const fileStore = useFileStore()
const projectStore = useProjectStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { t: pt } = useI18n({ useScope: 'local', messages: preflightMessages })
const showPreflight = ref(false)
const showStarterGuide = ref(false)
const supportsStarterGuide = computed(() => workflowStore.nodes.some((node) => node.data.kind === 'image-generation') || (workflowStore.nodes.some((node) => node.data.kind === 'whisper') && workflowStore.nodes.some((node) => node.data.kind === 'summary')))
function locateStarterNode(nodeId: string, field: string) { void locatePreflightIssue({ id: 'guide', level: 'unknown', code: '', nodeId, field }) }
function startGuidedRun() { showPreflight.value = true; void startRun() }
function openGuidedResults() { if (currentWorkflowRun.value) void router.push(`/runs/${currentWorkflowRun.value.id}`) }
const preflightIssues = computed(() => buildWorkflowPreflight({ id: workflowStore.workflowId, name: workflowStore.workflowName, nodes: workflowStore.nodes, edges: workflowStore.edges }, workflowStore.templates, { catalogLoaded: workflowStore.nodeCatalogLoaded, capabilitiesLoaded: workflowStore.capabilitiesLoaded, runtimeFileId: selectedInputFileId() ?? fileStore.latestBackendInputFileId }))
async function locatePreflightIssue(issue: PreflightIssue) {
  if (!issue.nodeId || !workflowStore.nodes.some((node) => node.id === issue.nodeId)) return
  workflowStore.nodes.forEach((node) => { node.selected = node.id === issue.nodeId })
  uiStore.setSelectedNode(issue.nodeId)
  await nextTick()
  if (issue.field) requestNodeConfigFieldFocus(issue.nodeId, issue.field)
}
const showCopilot = ref(false)
const showRunConsole = ref(false)
const startingRun = ref(false)
const importingComfyUi = ref(false)
let pageActive = true
let pageNavigationRevision = 0
let comfyUiImportSequence = 0
let pageSaveSequence = 0
let saveNavigation: {
  fromPath: string
  fullPath: string
  workflowId: string
  navigationRevision: number
  saveSequence: number
} | null = null

function ownsSaveNavigation(fullPath: string, fromPath?: string) {
  return pageActive && saveNavigation !== null
    && saveNavigation.fullPath === fullPath
    && (fromPath === undefined || saveNavigation.fromPath === fromPath)
    && saveNavigation.workflowId === workflowStore.workflowId
    && saveNavigation.navigationRevision === pageNavigationRevision
    && saveNavigation.saveSequence === pageSaveSequence
}

// 已完成的导航立即废弃旧页面请求；拒绝导航不会改变代次。
watch(() => route.fullPath, (to, from) => {
  const preservesSavedCanvas = ownsSaveNavigation(to, from)
  pageNavigationRevision += 1
  if (preservesSavedCanvas && saveNavigation) {
    saveNavigation.navigationRevision = pageNavigationRevision
  } else {
    saveNavigation = null
  }
  comfyUiImportSequence += 1
  importingComfyUi.value = false
  comfyUiImportError.value = null
}, { flush: 'sync' })
const copyingWorkflow = ref(false)
const showingWorkflowTemplates = ref(false)
const comfyUiImportError = ref<string | null>(null)
const comfyUiFileInput = ref<HTMLInputElement | null>(null)
const currentWorkflowRun = computed(() =>
  runStore.currentRun && workflowRunBelongsToWorkflow(
    runStore.currentRun,
    workflowStore.workflowId,
    workflowStore.backendDefinitionId,
  )
    ? runStore.currentRun
    : null,
)
const currentWorkflowRunActive = computed(() => isActiveWorkflowRun(currentWorkflowRun.value))
const currentWorkflowRunWaiting = computed(() => isWaitingWorkflowRun(currentWorkflowRun.value))
const runButtonBusy = computed(() => startingRun.value || currentWorkflowRunActive.value)
const runButtonLabel = computed(() => currentWorkflowRunWaiting.value
  ? t('workflow.waitingForInput')
  : runButtonBusy.value
    ? t('status.running')
    : t('workflow.run'),
)
const requiresFileInput = computed(() => workflowRequiresFileInput(workflowStore.nodes))

const hasWorkflowContext = computed(() => {
  return String(route.params.id || '') !== 'new'
    || Boolean(routeQueryString(route.query.projectId))
    || Boolean(routeQueryString(route.query.name))
})
const shouldShowEmptyWorkflowGuide = computed(() => {
  return !hasWorkflowContext.value
})
const copilotContext = computed(() => ({
  workflowId: workflowStore.workflowId,
  workflowName: workflowStore.workflowName,
  backendDefinitionId: workflowStore.backendDefinitionId,
  backendVersion: workflowStore.backendVersion,
  editRevision: workflowStore.editRevision,
  projectId: workflowStore.projectId,
  selectedNodeId: uiStore.selectedNodeId,
  nodes: workflowStore.nodes,
  edges: workflowStore.edges,
  templates: workflowStore.templates,
  currentRun: runStore.currentRun,
  logs: runStore.logs,
  runError: workflowStore.runError,
}))

function routeQueryString(value: unknown) {
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

function numericProjectId(value: unknown) {
  const parsed = Number(routeQueryString(value) ?? value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function openComfyUiFilePicker() {
  comfyUiImportError.value = null
  comfyUiFileInput.value?.click()
}

function importErrorMessage(error: unknown) {
  const normalized = toApiError(error, 'workflow')
  return normalized.message || t('workflow.importComfyUiFailed')
}

async function handleComfyUiFileChange(event: Event) {
  const input = event.target
  const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined
  if (!file) {
    return
  }

  if (!confirmDiscardUnsavedChanges()) {
    if (input instanceof HTMLInputElement) {
      input.value = ''
    }
    return
  }

  const requestId = ++comfyUiImportSequence
  const navigationRevision = pageNavigationRevision
  const editRevision = workflowStore.editRevision
  const projectId = numericProjectId(route.query.projectId) ?? numericProjectId(projectStore.currentProject?.id)
  const ownsRequest = () => pageActive && requestId === comfyUiImportSequence
    && navigationRevision === pageNavigationRevision
  const canApply = () => ownsRequest() && workflowStore.editRevision === editRevision
  importingComfyUi.value = true
  comfyUiImportError.value = null
  try {
    const text = await file.text()
    if (!canApply()) return
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(t('workflow.importComfyUiInvalid'))
    }

    const imported = await importComfyUiWorkflow({
      name: file.name.replace(/\.json$/i, '') || t('workflow.importComfyUiDefaultName'),
      description: t('workflow.importComfyUiDescription'),
      projectId,
      workflowJson: parsed as Record<string, unknown>,
    })
    if (!canApply()) return
    const graph = mapBackendDefinitionGraph(imported.nodes)

    workflowStore.resetToEmptyWorkflow()
    workflowStore.workflowName = imported.name
    workflowStore.projectId = imported.projectId ?? projectId ?? null
    workflowStore.setNodes(graph.nodes)
    workflowStore.setEdges(graph.edges)
    uiStore.setSelectedNode(graph.nodes[0]?.id ?? null)
  } catch (error) {
    if (canApply()) comfyUiImportError.value = importErrorMessage(error)
  } finally {
    if (ownsRequest()) importingComfyUi.value = false
    if (requestId === comfyUiImportSequence && input instanceof HTMLInputElement) {
      input.value = ''
    }
  }
}

async function loadRouteWorkflow(workflowId: string, projectReady: Promise<unknown> = Promise.resolve()) {
  const projectId = routeQueryString(route.query.projectId)
  const workflowLoad = workflowStore.loadWorkflow(workflowId, {
    initialName: routeQueryString(route.query.name),
  })
  try {
    await projectReady
  } catch (error) {
    // A rejected project request must not escape the mounted hook and become
    // an unhandled Vue promise rejection. Keep the workflow load settled too.
    await workflowLoad.catch(() => false)
    const details = error instanceof Error && error.message ? error.message : t('workflow.loadFailedUnknown')
    workflowStore.loadingError = `${t('workflow.loadFailed')}: ${details}`
    return false
  }
  const loaded = await workflowLoad
  if (!loaded) {
    return false
  }
  if (projectId) {
    projectStore.selectProject(projectId)
  } else {
    projectStore.selectProjectByWorkflow(workflowId)
  }
  await runStore.selectRunForWorkflow(workflowStore.workflowId, workflowStore.backendDefinitionId)
  if (runStore.currentRun && workflowRunBelongsToWorkflow(
    runStore.currentRun,
    workflowStore.workflowId,
    workflowStore.backendDefinitionId,
  )) {
    runStore.currentRun.nodeStates.forEach((node) => {
      workflowStore.updateNodeStatus(node.nodeId, node.status, node.durationMs)
    })
  }
  const selectedNodeStillExists = workflowStore.nodes.some((node) => node.id === uiStore.selectedNodeId)
  if (!selectedNodeStillExists) {
    uiStore.setSelectedNode(workflowStore.nodes[0]?.id ?? null)
  }
  return true
}

async function retryLoadWorkflow() {
  const loaded = await loadRouteWorkflow(String(route.params.id || 'new'))
  if (loaded) {
    runStore.subscribeCurrentRun()
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!workflowStore.dirty) {
    return
  }
  event.preventDefault()
  event.returnValue = ''
}

function handleEditorKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) {
    return
  }
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier) {
    return
  }
  if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
    if (workflowStore.undo()) {
      event.preventDefault()
    }
  } else if (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)) {
    if (workflowStore.redo()) {
      event.preventDefault()
    }
  }
}

function resetWorkflow() {
  if (workflowStore.dirty && !window.confirm(t('workflow.resetConfirm'))) {
    return
  }
  showStarterGuide.value = false
  showPreflight.value = false
  workflowStore.clearCurrentWorkflow()
  uiStore.setSelectedNode(null)
}

function confirmDiscardUnsavedChanges() {
  if (!workflowStore.dirty) {
    return true
  }
  return window.confirm(t('workflow.unsavedChangesConfirm'))
}

onBeforeRouteLeave(confirmDiscardUnsavedChanges)

onBeforeRouteUpdate((to, from) => {
  if (to.fullPath === from.fullPath || ownsSaveNavigation(to.fullPath, from.fullPath)) {
    return true
  }
  return confirmDiscardUnsavedChanges()
})
// 其他异步守卫等待期间仍可能应用模板或导入新画布，提交内部导航前再次核对归属。
const stopGuardingSaveNavigation = router.beforeResolve((to, from) => {
  if (saveNavigation?.fullPath === to.fullPath && saveNavigation.fromPath === from.fullPath) {
    return ownsSaveNavigation(to.fullPath, from.fullPath)
  }
  return true
})
const initializingWorkflow = ref(hasWorkflowContext.value)
let pendingStart: { intent: string; idempotencyKey: string } | null = null
let startNavigationGeneration = 0
let activeRunStart: {
  generation: number
  workflowId: string
  canonicalRoute?: string
} | null = null

function invalidateRunStart() {
  startNavigationGeneration += 1
  activeRunStart = null
  startingRun.value = false
  pendingStart = null
}

const stopWatchingStartNavigation = router.afterEach((to, from, failure) => {
  // 被拒绝的导航不撤销当前操作；成功离开再返回也必须产生新的代次。
  if (failure || to.fullPath === from.fullPath) return
  if (activeRunStart?.canonicalRoute === to.fullPath) return
  invalidateRunStart()
})

onBeforeUnmount(() => {
  invalidateRunStart()
  stopWatchingStartNavigation()
})

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleEditorKeydown)
  const projectReady = projectStore.loadProjects()
  const auxiliaryLoads = Promise.allSettled([
    workflowStore.loadNodeTemplates(),
    runStore.loadRuns({ selectDefault: false }),
    fileStore.loadFiles(),
  ])
  if (!hasWorkflowContext.value) {
    await Promise.allSettled([projectReady, auxiliaryLoads])
    workflowStore.resetToEmptyWorkflow()
    runStore.clearCurrentRun()
    initializingWorkflow.value = false
    return
  }
  try {
    const routeWorkflowLoad = loadRouteWorkflow(String(route.params.id || 'new'), projectReady)
    const [loaded] = await Promise.all([routeWorkflowLoad, auxiliaryLoads])
    if (loaded) {
      runStore.subscribeCurrentRun()
    }
  } finally {
    initializingWorkflow.value = false
  }
})

onBeforeUnmount(() => {
  pageActive = false
  saveNavigation = null
  stopGuardingSaveNavigation()
  comfyUiImportSequence += 1
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleEditorKeydown)
})

watch(
  () => [route.params.id, route.query.projectId, route.query.name],
  async ([workflowId]) => {
    // 保存或 Run 仅规范化当前画布地址时，不能重新加载覆盖较新的编辑。
    if (activeRunStart?.canonicalRoute === route.fullPath || ownsSaveNavigation(route.fullPath)) return
    if (!hasWorkflowContext.value) {
      workflowStore.resetToEmptyWorkflow()
      showCopilot.value = false
      showRunConsole.value = false
      return
    }
    showStarterGuide.value = false
    showPreflight.value = false
    await loadRouteWorkflow(String(workflowId || 'new'))
  },
)

async function saveWorkflow() {
  const saveSequence = ++pageSaveSequence
  try {
    const projectId = routeQueryString(route.query.projectId) ?? projectStore.currentProject?.id
    const navigationRevision = pageNavigationRevision
    const saved = await workflowStore.saveCurrentWorkflow({ projectId: numericProjectId(projectId) })
    if (!saved || !pageActive || saveSequence !== pageSaveSequence || navigationRevision !== pageNavigationRevision) return
    const savedWorkflowId = saved.workflowId
    if (projectId) {
      projectStore.linkWorkflowToProject(projectId, savedWorkflowId)
    }
    if (String(route.params.id || 'new') !== savedWorkflowId) {
      const canonicalRoute = {
        path: `/workflows/${savedWorkflowId}`,
        query: projectId ? { projectId } : undefined,
      }
      // 保存只规范化当前画布的地址，不丢弃保存期间的新编辑或重载历史。
      const navigation = {
        fromPath: route.fullPath,
        fullPath: router.resolve(canonicalRoute).fullPath,
        workflowId: savedWorkflowId,
        navigationRevision: pageNavigationRevision,
        saveSequence,
      }
      saveNavigation = navigation
      try {
        const failure = await router.replace(canonicalRoute)
        if (failure || saveNavigation !== navigation || saveSequence !== pageSaveSequence
          || !ownsSaveNavigation(route.fullPath)) return
      } finally {
        if (saveNavigation === navigation) saveNavigation = null
      }
    }
    projectStore.updateWorkflowStatus(savedWorkflowId, 'ready')
  } catch {
    // The store exposes the localized save error for the page banner.
  }
}

async function copyWorkflow() {
  if (!workflowStore.backendDefinitionId || copyingWorkflow.value) {
    return
  }
  copyingWorkflow.value = true
  workflowStore.setRunError(null)
  try {
    if (workflowStore.dirty) {
      await workflowStore.saveCurrentWorkflow({
        projectId: numericProjectId(routeQueryString(route.query.projectId) ?? projectStore.currentProject?.id),
      })
    }
    const copied = await workflowStore.copyCurrentWorkflow()
    await router.replace({
      path: `/workflows/${copied.id}`,
      query: route.query.projectId ? { projectId: routeQueryString(route.query.projectId) } : undefined,
    })
  } catch (error) {
    workflowStore.setRunError(`${t('workflow.copyFailed')}: ${runErrorMessage(error)}`)
  } finally {
    copyingWorkflow.value = false
  }
}

async function openWorkflowTemplates() {
  if (workflowStore.workflowTemplatesLoading) {
    return
  }
  workflowStore.setRunError(null)
  try {
    await workflowStore.loadWorkflowTemplates()
    showingWorkflowTemplates.value = true
  } catch (error) {
    workflowStore.setRunError(`${t('workflow.templatesLoadFailed')}: ${runErrorMessage(error)}`)
  }
}

function applyWorkflowTemplate(template: (typeof workflowStore.workflowTemplates)[number]) {
  if (!confirmDiscardUnsavedChanges()) {
    return
  }
  workflowStore.useWorkflowTemplate(template)
  showStarterGuide.value = supportsStarterGuide.value
  uiStore.setSelectedNode(workflowStore.nodes[0]?.id ?? null)
  showingWorkflowTemplates.value = false
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
  if (runButtonBusy.value || workflowStore.saving) {
    return
  }

  if (preflightIssues.value.some((issue) => issue.level === 'blocking')) { showPreflight.value = true; return }
  startingRun.value = true
  const operation = {
    generation: startNavigationGeneration,
    workflowId: workflowStore.workflowId,
    canonicalRoute: undefined as string | undefined,
  }
  activeRunStart = operation
  const ownsOperation = () => activeRunStart === operation
    && operation.generation === startNavigationGeneration
  const ownsWorkflow = () => ownsOperation() && operation.workflowId === workflowStore.workflowId
  const projectId = routeQueryString(route.query.projectId) ?? projectStore.currentProject?.id
  workflowStore.setRunError(null)
  try {
    await runStore.loadRuns({ selectDefault: false, workflowId: operation.workflowId })
    if (!ownsWorkflow()) return
    let fileId: string | undefined
    if (requiresFileInput.value) {
      await fileStore.loadFiles()
      if (!ownsWorkflow()) return
      fileId = selectedInputFileId() ?? fileStore.latestBackendInputFileId
      if (!fileId) {
        workflowStore.setRunError(t('workflow.runRequiresFileId'))
        return
      }
    }

    const intent = workflowStartIntent({
      id: workflowStore.workflowId,
      name: workflowStore.workflowName,
      nodes: workflowStore.nodes,
      edges: workflowStore.edges,
    }, fileId)
    // 上次回执失败不代表未启动；改配置必须明确选择新运行，不能静默重复执行。
    if (pendingStart && pendingStart.intent !== intent
      && !window.confirm(t('workflow.runChangedIntentConfirm'))) return

    const editRevision = workflowStore.editRevision
    const submittedWorkflow = {
      workflowName: workflowStore.workflowName,
      nodes: workflowStore.nodes.map((node) => ({ ...node, data: { ...node.data } })),
    }
    await workflowStore.saveCurrentWorkflow({
      allowMockFallback: false,
      projectId: numericProjectId(projectId),
    })
    // 保存可能因导航或更新的画布而失效，不能继续读取别的工作流并启动。
    if (!ownsOperation() || workflowStore.editRevision !== editRevision) return
    operation.workflowId = workflowStore.workflowId
    if (projectId) {
      projectStore.linkWorkflowToProject(projectId, operation.workflowId)
    }
    if (String(route.params.id || 'new') !== operation.workflowId) {
      const canonicalRoute = {
        path: `/workflows/${operation.workflowId}`,
        query: projectId ? { projectId } : undefined,
      }
      operation.canonicalRoute = router.resolve(canonicalRoute).fullPath
      const failure = await router.replace(canonicalRoute)
      operation.canonicalRoute = undefined
      if (failure || !ownsWorkflow()) return
    }
    if (!workflowStore.backendDefinitionId) {
      workflowStore.setRunError(t('workflow.runRequiresBackendDefinition'))
      return
    }
    // 只有真正派发时才替换意图；保存失败、取消或迟到保存都保留原重试键。
    if (!pendingStart || pendingStart.intent !== intent) {
      pendingStart = { intent, idempotencyKey: crypto.randomUUID() }
    }
    const idempotencyKey = pendingStart.idempotencyKey
    const result = await workflowApi.startRun(
      operation.workflowId,
      fileId ? { fileId } : {},
      { allowMockFallback: false, idempotencyKey },
    )
    // 已派发的后端运行可从历史重新发现，但迟到响应不能接管新页面。
    if (!ownsWorkflow()) return
    pendingStart = null
    const run = runStore.createRunFromWorkflow({
      runId: result.runId,
      workflowId: operation.workflowId,
      ...submittedWorkflow,
      backendInstanceId: result.backendInstanceId,
      runtimeWorkflowId: result.runtimeWorkflowId,
      definitionId: result.definitionId,
      backendStatus: result.backendStatus,
    })
    projectStore.updateWorkflowStatus(operation.workflowId, 'running')
    runStore.subscribeCurrentRun()
    await router.push(`/runs/${run.id}`)
  } catch (error) {
    if (ownsWorkflow()) {
      workflowStore.setRunError(`${t('workflow.runFailed')}: ${runErrorMessage(error)}`)
    }
  } finally {
    if (ownsOperation()) {
      activeRunStart = null
      startingRun.value = false
    }
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

function templateByKind(kind: WorkflowNodeKind) {
  return workflowStore.templates.find((template) => template.kind === kind)
}

function handleCopilotCanvasAction(action: WorkflowCopilotCanvasAction) {
  const template = templateByKind(action.nodeKind)
  if (!template) {
    return
  }

  const node = action.type === 'add-node-after'
    ? workflowStore.addNodeAfter(action.sourceNodeId, template)
    : workflowStore.addNodeFromTemplate(template, {
        x: 80 + workflowStore.nodes.length * 40,
        y: 160 + workflowStore.nodes.length * 30,
      })

  if (node) {
    uiStore.setSelectedNode(node.id)
  }
}

function handleCopilotWorkflowDraft(request: CopilotWorkflowDraftApplyRequest) {
  const applied = workflowStore.applyCopilotWorkflowDraft(request)
  if (applied) {
    if (!workflowStore.nodes.some((node) => node.id === uiStore.selectedNodeId)) uiStore.setSelectedNode(null)
    void canvasRef.value?.fitCanvas()
  }
  return applied
}
</script>

<template>
  <input
    ref="comfyUiFileInput"
    type="file"
    accept=".json,application/json"
    class="hidden"
    @change="handleComfyUiFileChange"
  />

  <section v-if="initializingWorkflow || workflowStore.loading" class="grid h-full place-items-center bg-app-bg px-6">
    <div class="flex items-center gap-3 rounded-xl border border-app-border bg-white px-6 py-5 text-sm font-medium text-text-secondary shadow-panel">
      <LoaderCircle class="h-5 w-5 animate-spin text-primary" />
      {{ t('workflow.loading') }}
    </div>
  </section>

  <section v-else-if="workflowStore.loadingError" class="grid h-full place-items-center bg-app-bg px-6">
    <div class="w-full max-w-xl rounded-2xl border border-status-error/25 bg-white p-7 shadow-panel">
      <p class="text-lg font-semibold text-text-primary">{{ t('workflow.loadFailedTitle') }}</p>
      <p class="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-status-error">
        {{ workflowStore.loadingError }}
      </p>
      <div class="mt-5 flex flex-wrap gap-3">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-node hover:bg-primary-dark" @click="retryLoadWorkflow">
          <RotateCcw class="h-4 w-4" />
          {{ t('workflow.retryLoad') }}
        </button>
        <RouterLink to="/projects" class="inline-flex items-center rounded-lg border border-app-border bg-white px-4 py-2.5 text-sm font-semibold text-text-secondary hover:border-primary/30 hover:text-primary">
          {{ t('workflow.returnToProjects') }}
        </RouterLink>
      </div>
    </div>
  </section>

  <section v-else-if="shouldShowEmptyWorkflowGuide" class="grid h-full place-items-center bg-app-bg px-6">
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

        <button
          type="button"
          data-action="import-comfyui"
          class="group rounded-xl border border-primary/20 bg-white p-5 text-left transition hover:border-primary/40 hover:bg-primary-soft/30 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="importingComfyUi"
          @click="openComfyUiFilePicker"
        >
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary shadow-sm">
              <FileJson class="h-5 w-5" />
            </span>
            <div>
              <p class="text-sm font-semibold text-text-primary">{{ importingComfyUi ? t('workflow.importingComfyUi') : t('workflow.importComfyUi') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('workflow.importComfyUiHint') }}</p>
            </div>
          </div>
        </button>
      </div>
      <p v-if="comfyUiImportError" class="mx-6 mb-6 rounded-lg border border-status-error/30 bg-red-50 px-4 py-3 text-sm text-status-error" role="alert">
        {{ comfyUiImportError }}
      </p>
    </div>
  </section>

  <section v-else class="grid h-full grid-rows-[auto_auto_minmax(0,1fr)]">
    <header class="flex flex-col gap-3 border-b border-app-border bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text-primary">{{ workflowStore.workflowName }}</p>
        <p class="truncate text-xs text-text-muted">{{ t('workflow.mockWorkflow') }} · {{ workflowStore.nodes.length }} {{ t('common.nodes') }} · {{ workflowStore.edges.length }} {{ t('common.edges') }}</p>
        <p v-if="workflowStore.savingError || workflowStore.runError || comfyUiImportError" class="mt-2 rounded-md border border-status-error/30 bg-red-50 px-3 py-2 text-xs font-medium text-status-error" role="alert">
          {{ workflowStore.savingError || workflowStore.runError || comfyUiImportError }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-action="import-comfyui"
          class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="importingComfyUi"
          @click="openComfyUiFilePicker"
        >
          <LoaderCircle v-if="importingComfyUi" class="h-4 w-4 animate-spin" />
          <Upload v-else class="h-4 w-4" />
          {{ importingComfyUi ? t('workflow.importingComfyUi') : t('workflow.importComfyUi') }}
        </button>
        <button
          type="button"
          data-action="workflow-templates"
          class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="workflowStore.workflowTemplatesLoading"
          @click="openWorkflowTemplates"
        >
          <LoaderCircle v-if="workflowStore.workflowTemplatesLoading" class="h-4 w-4 animate-spin" />
          <Library v-else class="h-4 w-4" />
          {{ t('workflow.templates') }}
        </button>
        <button
          v-if="workflowStore.backendDefinitionId"
          type="button"
          data-action="copy-workflow"
          class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="copyingWorkflow || workflowStore.saving"
          @click="copyWorkflow"
        >
          <LoaderCircle v-if="copyingWorkflow" class="h-4 w-4 animate-spin" />
          <Copy v-else class="h-4 w-4" />
          {{ copyingWorkflow ? t('workflow.copyingWorkflow') : t('workflow.copyWorkflow') }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50" :title="t('workflow.undo')" :aria-label="t('workflow.undo')" :disabled="!workflowStore.canUndo" @click="workflowStore.undo">
          <Undo2 class="h-4 w-4" />
          <span class="hidden xl:inline">{{ t('workflow.undo') }}</span>
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50" :title="t('workflow.redo')" :aria-label="t('workflow.redo')" :disabled="!workflowStore.canRedo" @click="workflowStore.redo">
          <Redo2 class="h-4 w-4" />
          <span class="hidden xl:inline">{{ t('workflow.redo') }}</span>
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:text-primary" @click="resetWorkflow">
          <RotateCcw class="h-4 w-4" />
          {{ t('workflow.reset') }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft disabled:opacity-60" :disabled="workflowStore.saving" @click="saveWorkflow">
          <Save class="h-4 w-4" />
          {{ workflowStore.saving ? t('workflow.saving') : workflowStore.dirty ? t('workflow.saveWorkflow') : t('workflow.saved') }}
        </button>
        <button v-if="supportsStarterGuide" type="button" data-action="workflow-guide" class="rounded-md border border-app-border px-3 py-2 text-sm text-primary" @click="showStarterGuide = !showStarterGuide">{{ pt('guide') }}</button>
        <button type="button" data-action="workflow-preflight" class="rounded-md border border-app-border px-3 py-2 text-sm text-primary" @click="showPreflight = !showPreflight">{{ pt('title') }}</button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70" :title="runButtonBusy ? runButtonLabel : undefined" :disabled="runButtonBusy || workflowStore.saving" @click="startRun">
          <LoaderCircle v-if="runButtonBusy && !currentWorkflowRunWaiting" class="h-4 w-4 animate-spin" />
          <PauseCircle v-else-if="currentWorkflowRunWaiting" class="h-4 w-4" />
          <Play v-else class="h-4 w-4" />
          {{ runButtonLabel }}
        </button>
      </div>
    </header>

    <div class="max-h-[45vh] overflow-y-auto"><WorkflowStarterGuide v-if="showStarterGuide && supportsStarterGuide" :nodes="workflowStore.nodes" :run="currentWorkflowRun" :busy="runButtonBusy || workflowStore.saving" @locate="locateStarterNode" @run="startGuidedRun" @results="openGuidedResults" @close="showStarterGuide = false" /><WorkflowPreflight v-if="showPreflight" :issues="preflightIssues" @close="showPreflight = false" @locate="locatePreflightIssue" /></div>
    <div class="relative grid min-h-0 min-w-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <WorkflowCanvas ref="canvasRef" />
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
          <AICopilotPanel
            :context="copilotContext"
            :apply-workflow-draft="handleCopilotWorkflowDraft"
            :apply-canvas-edit="handleCopilotWorkflowDraft"
            @apply-canvas-action="handleCopilotCanvasAction"
            @close="showCopilot = false"
          />
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

      <div v-if="showingWorkflowTemplates" class="absolute inset-0 z-40 grid place-items-center bg-slate-950/25 p-4">
        <section class="w-full max-w-xl rounded-xl border border-app-border bg-white p-5 shadow-panel" role="dialog" aria-modal="true" aria-labelledby="workflow-template-title">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 id="workflow-template-title" class="text-base font-semibold text-text-primary">{{ t('workflow.templates') }}</h2>
              <p class="mt-1 text-xs text-text-muted">{{ t('workflow.templatesHint') }}</p>
            </div>
            <button type="button" class="rounded-md p-1 text-text-muted hover:bg-slate-100 hover:text-text-primary" :aria-label="t('common.close')" @click="showingWorkflowTemplates = false">
              <X class="h-5 w-5" />
            </button>
          </div>
          <div class="mt-4 grid gap-2">
            <button
              v-for="template in workflowStore.workflowTemplates"
              :key="template.id"
              type="button"
              class="rounded-lg border border-app-border px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary-soft/20"
              @click="applyWorkflowTemplate(template)"
            >
              <p class="text-sm font-semibold text-text-primary">{{ template.name }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ template.description || t('workflow.templatesHint') }}</p>
              <p class="mt-2 text-[11px] text-text-muted">{{ template.nodes.length }} {{ t('common.nodes') }} · {{ template.edges.length }} {{ t('common.edges') }}</p>
            </button>
            <p v-if="workflowStore.workflowTemplates.length === 0" class="rounded-lg border border-dashed border-app-border px-4 py-6 text-center text-sm text-text-muted">
              {{ t('workflow.noTemplates') }}
            </p>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
