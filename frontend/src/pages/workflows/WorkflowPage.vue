<script setup lang="ts">
// pattern: Imperative Shell
import { Copy, FileJson, FolderKanban, Library, LoaderCircle, PauseCircle, Play, Plus, Redo2, RotateCcw, Save, Undo2, Upload, Workflow, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter, type RouteLocationNormalized } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import WorkflowPreflight from '@/components/workflow/WorkflowPreflight.vue'
import WorkflowStarterGuide from '@/components/workflow/WorkflowStarterGuide.vue'
import UnsavedNavigationDialog from '@/components/workflow/UnsavedNavigationDialog.vue'
import RunNodeRecoveryBanner from '@/components/workflow/RunNodeRecoveryBanner.vue'
import { continuityMessages } from '@/components/workflow/continuityMessages'
import { preflightMessages } from '@/components/workflow/preflightMessages'
import { buildWorkflowPreflight, type PreflightIssue } from '@/utils/workflowPreflight'
import { requestNodeConfigFieldFocus } from '@/utils/focusNodeConfig'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { workflowStartIntent } from '@/utils/workflowStartIntent'
import { upstreamVariables } from '@/utils/workflowVariables'
import { observeWorkflowNavigation } from '@/utils/workflowNavigation'
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
import { mergeCustomDefinitions, type CustomDefinition } from '@/utils/customNodes'
import { isActiveWorkflowRun, isWaitingWorkflowRun, workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'

const workflowStore = useWorkflowStore()
const canvasRef = ref<InstanceType<typeof WorkflowCanvas> | null>(null)
const runStore = useRunStore()
const fileStore = useFileStore()
const projectStore = useProjectStore()
const uiStore = useUiStore()
const route = useRoute()
const router = useRouter()
const workflowNavigation = observeWorkflowNavigation(router)
const { t } = useI18n()
const { t: pt } = useI18n({ useScope: 'local', messages: {
  'zh-CN': { ...preflightMessages['zh-CN'], ...continuityMessages['zh-CN'] },
  'en-US': { ...preflightMessages['en-US'], ...continuityMessages['en-US'] },
  'ja-JP': { ...preflightMessages['ja-JP'], ...continuityMessages['ja-JP'] },
} })
const ct = pt
const showPreflight = ref(false)
const showStarterGuide = ref(false)
const supportsStarterGuide = computed(() => workflowStore.nodes.some((node) => node.data.kind === 'image-generation') || (workflowStore.nodes.some((node) => node.data.kind === 'whisper') && workflowStore.nodes.some((node) => node.data.kind === 'summary')))
function locateStarterNode(nodeId: string, field: string) { void locatePreflightIssue({ id: 'guide', level: 'unknown', code: '', nodeId, field }) }
function startGuidedRun() { showPreflight.value = true; void startRun() }
function openGuidedResults() { if (currentWorkflowRun.value) void router.push(`/runs/${currentWorkflowRun.value.id}`) }
const preflightIssues = computed(() => buildWorkflowPreflight({ id: workflowStore.workflowId, name: workflowStore.workflowName, nodes: workflowStore.nodes, edges: workflowStore.edges }, workflowStore.templates, { catalogLoaded: workflowStore.nodeCatalogLoaded, capabilitiesLoaded: workflowStore.capabilitiesLoaded, runtimeFileId: selectedInputFileId() }))
async function locatePreflightIssue(issue: PreflightIssue) {
  if (!issue.nodeId || !workflowStore.nodes.some((node) => node.id === issue.nodeId)) return
  workflowStore.nodes.forEach((node) => { node.selected = node.id === issue.nodeId })
  uiStore.setSelectedNode(issue.nodeId)
  await nextTick()
  if (issue.field) requestNodeConfigFieldFocus(issue.nodeId, issue.field)
}
const showCopilot = ref(false)
const editorInteractionRevision = ref(0)
function noteEditorInteraction() {
  editorInteractionRevision.value += 1
  canvasRef.value?.cancelPendingFocus?.()
}
// 选择、编辑和未落库输入都优先于旧来源请求的自动定位。
watch([() => uiStore.selectedNodeId, () => workflowStore.editRevision], noteEditorInteraction, { flush: 'sync' })
async function locateSourceRunNode(nodeId: string, automaticRevision?: number) {
  if (automaticRevision !== undefined
    && (automaticRevision !== editorInteractionRevision.value || pendingNavigation.value)) return
  if (!workflowStore.nodes.some((node) => node.id === nodeId)) return
  workflowStore.nodes.forEach((node) => { node.selected = node.id === nodeId })
  uiStore.setSelectedNode(nodeId)
  const acceptedRevision = editorInteractionRevision.value
  await nextTick()
  if (!pageActive || acceptedRevision !== editorInteractionRevision.value || uiStore.selectedNodeId !== nodeId) return
  await canvasRef.value?.focusNode?.(nodeId)
}
const showRunConsole = ref(false)
const startingRun = ref(false)
const runPromptValues = ref<Record<string, string>>({})
const runPromptInputError = ref('')
const importingComfyUi = ref(false)
let pageActive = true
let pageNavigationRevision = 0
let comfyUiImportSequence = 0
let pageSaveSequence = 0
let pageCopySequence = 0
let workflowLoadSequence = 0
let copyNavigation: { fromPath: string; fullPath: string; ownsRequest: () => boolean } | null = null
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
  pageCopySequence += 1
  copyingWorkflow.value = false
  // 保存回执只规范化当前画布的地址，仍在读取或转换中的较新导入必须继续生效；
  // 真正离开当前工作流时，旧导入才作废，不能落到别的页面。
  if (!preservesSavedCanvas) {
    comfyUiImportSequence += 1
    importingComfyUi.value = false
    comfyUiImportError.value = null
  }
  showingWorkflowTemplates.value = false
  workflowStore.invalidateWorkflowTemplatesLoad()
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

const runPromptInputs = computed(() => {
  const required = new Map<string, { variable: string; nodeLabels: string[] }>()
  for (const node of workflowStore.nodes) {
    if (node.data.kind !== 'llm') continue
    const config = node.data.config
    if (typeof config.prompt === 'string' && config.prompt.trim()) continue
    const variable = typeof config.promptVariable === 'string' && config.promptVariable.trim()
      ? config.promptVariable.trim()
      : 'prompt'
    const suppliedUpstream = upstreamVariables(node.id, workflowStore.nodes, workflowStore.edges, workflowStore.templates)
      .some((candidate) => candidate.name === variable)
    if (suppliedUpstream) continue
    const existing = required.get(variable)
    if (existing) existing.nodeLabels.push(node.data.label)
    else required.set(variable, { variable, nodeLabels: [node.data.label] })
  }
  return [...required.values()]
})

watch(() => String(route.params.id ?? 'new'), (next, previous) => {
  if (next === previous || (previous === 'new' && next === workflowStore.workflowId)) return
  runPromptValues.value = {}
  runPromptInputError.value = ''
}, { flush: 'sync' })

function updateRunPromptValue(variable: string, event: Event) {
  runPromptValues.value = {
    ...runPromptValues.value,
    [variable]: (event.target as HTMLTextAreaElement).value,
  }
  if (runPromptValues.value[variable]?.trim()) runPromptInputError.value = ''
}

function promptRunVariables() {
  return Object.fromEntries(runPromptInputs.value.map(({ variable }) => [variable, runPromptValues.value[variable] ?? '']))
}

const hasWorkflowContext = computed(() => {
  return String(route.params.id || '') !== 'new'
    || Boolean(routeQueryString(route.query.projectId))
    || Boolean(routeQueryString(route.query.name))
})
const shouldShowEmptyWorkflowGuide = computed(() => {
  return !hasWorkflowContext.value && workflowStore.nodes.length === 0 && !workflowStore.dirty
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

// 保存与导入使用的项目归属：显式地址参数优先，其次是工作流自身的归属，
// 只有新工作流才回退到全局项目选择，避免全局选择被别的页面污染后写错归类。
function resolveWorkflowProjectId() {
  const routeProjectId = numericProjectId(routeQueryString(route.query.projectId))
  if (routeProjectId !== undefined) {
    return routeProjectId
  }
  const workflowProjectId = numericProjectId(workflowStore.projectId)
  if (workflowProjectId !== undefined) {
    return workflowProjectId
  }
  return numericProjectId(projectStore.currentProject?.id)
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
  const editRevision = workflowStore.editRevision
  const projectId = resolveWorkflowProjectId()
  // 导入归属只看导入代次：更新一代导入或真正离开当前工作流才会作废，
  // 保存回执引起的地址规范化属于同一张画布，不能让较新的导入失效。
  const ownsRequest = () => pageActive && requestId === comfyUiImportSequence
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

// 页面级加载代次：只有最后一次路由加载可以继续写入项目与错误信息。
// 页面卸载或目标工作流变化后，旧请求的收尾不能污染新页面。
function ownsWorkflowLoad(loadSequence: number, workflowId: string) {
  return pageActive
    && loadSequence === workflowLoadSequence
    && String(route.params.id || 'new') === workflowId
}

async function loadRouteWorkflow(workflowId: string, projectReady: Promise<unknown> = Promise.resolve()) {
  const loadSequence = ++workflowLoadSequence
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
    // 旧页面的失败信息不能覆盖新页面的加载状态。
    if (!ownsWorkflowLoad(loadSequence, workflowId)) {
      return false
    }
    const details = error instanceof Error && error.message ? error.message : t('workflow.loadFailedUnknown')
    workflowStore.loadingError = `${t('workflow.loadFailed')}: ${details}`
    return false
  }
  if (!ownsWorkflowLoad(loadSequence, workflowId)) {
    return false
  }
  const loaded = await workflowLoad
  if (!loaded || !ownsWorkflowLoad(loadSequence, workflowId)) {
    return false
  }
  if (projectId) {
    projectStore.selectProject(projectId)
  } else {
    projectStore.selectProjectByWorkflow(workflowId)
  }
  await runStore.selectRunForWorkflow(workflowStore.workflowId, workflowStore.backendDefinitionId)
  if (!ownsWorkflowLoad(loadSequence, workflowId)) {
    return false
  }
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
  // 离开确认弹窗打开时隔离画布快捷键：撤销/重做不得在用户做决定时改动画布。
  if (pendingNavigation.value) {
    return
  }
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

type PendingNavigation = { fromPath: string; fullPath: string; resolve: (allowed: boolean) => void }
const pendingNavigation = ref<PendingNavigation | null>(null)
const leaveSaveBusy = ref(false)
let leaveSaveSequence = 0
const leaveSaveError = ref('')
let approvedNavigation: { fromPath: string; fullPath: string; editRevision: number } | null = null

function settleNavigation(allowed: boolean) {
  const pending = pendingNavigation.value
  if (!pending) return
  pendingNavigation.value = null
  // 弹窗结束即释放本次导航的等待锁；同一画布仍由 Store 的 saving 防止重复保存。
  leaveSaveSequence += 1
  leaveSaveBusy.value = false
  leaveSaveError.value = ''
  approvedNavigation = allowed
    ? { fromPath: pending.fromPath, fullPath: pending.fullPath, editRevision: workflowStore.editRevision }
    : null
  pending.resolve(allowed)
}

function requestNavigation(to: RouteLocationNormalized, from: RouteLocationNormalized) {
  if (to.fullPath === from.fullPath) return true
  if (copyNavigation?.fullPath === to.fullPath && copyNavigation.fromPath === from.fullPath) {
    return copyNavigation.ownsRequest()
  }
  if (saveNavigation?.fullPath === to.fullPath && saveNavigation.fromPath === from.fullPath) {
    return ownsSaveNavigation(to.fullPath, from.fullPath)
  }
  // 新目标取代旧目标；旧保存只能结束请求，不能替用户决定新的导航。
  settleNavigation(false)
  approvedNavigation = null
  // 纯节点定位或锚点只改变查看上下文，不替换画布，也不能丢弃未保存内容。
  if (to.path === from.path
    && routeQueryString(to.query.projectId) === routeQueryString(from.query.projectId)
    && routeQueryString(to.query.name) === routeQueryString(from.query.name)) return true
  if (!workflowStore.dirty) return true
  return new Promise<boolean>((resolve) => {
    pendingNavigation.value = { fromPath: from.fullPath, fullPath: to.fullPath, resolve }
  })
}

async function saveBeforeLeaving() {
  const pending = pendingNavigation.value
  if (!pending || leaveSaveBusy.value || workflowStore.saving) return
  const saveSequence = ++leaveSaveSequence
  leaveSaveBusy.value = true
  leaveSaveError.value = ''
  const ownsRequest = () => pageActive && pendingNavigation.value === pending && saveSequence === leaveSaveSequence
  try {
    const projectId = resolveWorkflowProjectId()
    const saved = await workflowStore.saveCurrentWorkflow({ projectId })
    if (!ownsRequest()) return
    if (!saved || workflowStore.dirty) {
      leaveSaveError.value = ct(saved ? 'leaveChanged' : 'leaveFailed')
      return
    }
    if (projectId) projectStore.linkWorkflowToProject(String(projectId), saved.workflowId)
    projectStore.updateWorkflowStatus(saved.workflowId, 'ready')
    // 继续原来的 push/back/replace，保留历史语义，不额外跳转规范化地址。
    settleNavigation(true)
  } catch {
    if (ownsRequest()) leaveSaveError.value = workflowStore.savingError || ct('leaveFailed')
  } finally {
    if (saveSequence === leaveSaveSequence) leaveSaveBusy.value = false
  }
}

onBeforeRouteLeave(requestNavigation)

onBeforeRouteUpdate((to, from) => {
  return requestNavigation(to, from)
})
// 其他异步守卫等待期间仍可能应用模板或导入新画布，提交内部导航前再次核对归属。
const stopGuardingSaveNavigation = router.beforeResolve((to, from) => {
  if (copyNavigation?.fullPath === to.fullPath && copyNavigation.fromPath === from.fullPath) {
    return copyNavigation.ownsRequest()
  }
  if (saveNavigation?.fullPath === to.fullPath && saveNavigation.fromPath === from.fullPath) {
    return ownsSaveNavigation(to.fullPath, from.fullPath)
  }
  if (approvedNavigation?.fullPath === to.fullPath && approvedNavigation.fromPath === from.fullPath
    && approvedNavigation.editRevision !== workflowStore.editRevision) return requestNavigation(to, from)
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
    // 空白入口只在进入时清理；辅助读取返回时用户可能已经打开或编辑了新画布。
    workflowStore.resetToEmptyWorkflow()
    runStore.clearCurrentRun()
    initializingWorkflow.value = false
    await Promise.allSettled([projectReady, auxiliaryLoads])
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
  settleNavigation(false)
  saveNavigation = null
  stopGuardingSaveNavigation()
  comfyUiImportSequence += 1
  workflowStore.invalidateWorkflowTemplatesLoad()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleEditorKeydown)
})

watch(
  [() => route.params.id, () => routeQueryString(route.query.projectId), () => routeQueryString(route.query.name)],
  async ([workflowId]) => {
    // 保存或 Run 仅规范化当前画布地址时，不能重新加载覆盖较新的编辑。
    if (activeRunStart?.canonicalRoute === route.fullPath || ownsSaveNavigation(route.fullPath)) return
    if (!hasWorkflowContext.value) {
      // 清空画布同样代表旧加载失去归属，待完成的旧请求不能再写入项目或错误信息。
      workflowLoadSequence += 1
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
    const projectId = resolveWorkflowProjectId()
    const navigationRevision = pageNavigationRevision
    const saved = await workflowStore.saveCurrentWorkflow({ projectId })
    if (!saved || !pageActive || saveSequence !== pageSaveSequence || navigationRevision !== pageNavigationRevision || pendingNavigation.value) return
    const savedWorkflowId = saved.workflowId
    if (projectId) {
      projectStore.linkWorkflowToProject(String(projectId), savedWorkflowId)
    }
    if (String(route.params.id || 'new') !== savedWorkflowId) {
      const canonicalRoute = {
        path: `/workflows/${savedWorkflowId}`,
        query: {
          ...(projectId ? { projectId } : {}),
          ...(route.query.sourceRunId ? {
            sourceRunId: route.query.sourceRunId,
            nodeId: route.query.nodeId,
            runReturnLocation: route.query.runReturnLocation,
          } : {}),
        },
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
  if (!workflowStore.backendDefinitionId || copyingWorkflow.value || workflowStore.saving) return
  const sequence = ++pageCopySequence
  const navigationRevision = pageNavigationRevision
  const importSequence = comfyUiImportSequence
  const workflowId = workflowStore.workflowId
  const editRevision = workflowStore.editRevision
  const ownsRequest = () => pageActive && sequence === pageCopySequence
    && navigationRevision === pageNavigationRevision
    // 接受新导入即改变画布意图，不必等待读取或转换完成后才保护它。
    && importSequence === comfyUiImportSequence
    && workflowId === workflowStore.workflowId && editRevision === workflowStore.editRevision
  copyingWorkflow.value = true
  workflowStore.setRunError(null)
  try {
    if (workflowStore.dirty) {
      const saved = await workflowStore.saveCurrentWorkflow({
        projectId: resolveWorkflowProjectId(),
      })
      // 自动保存只服务于点击时的图，不能复制保存等待期间换入或修改的图。
      if (!saved || !ownsRequest() || workflowStore.dirty
        || workflowNavigation.pending || pendingNavigation.value) return
    }
    const copied = await workflowStore.copyCurrentWorkflow()
    if (!ownsRequest() || workflowNavigation.pending || pendingNavigation.value) return
    const target = {
      path: `/workflows/${copied.id}`,
      query: route.query.projectId ? { projectId: routeQueryString(route.query.projectId) } : undefined,
    }
    const navigation = { fromPath: route.fullPath, fullPath: router.resolve(target).fullPath, ownsRequest }
    copyNavigation = navigation
    try {
      // 保留原画布，只有路由守卫完成后才由正常加载流程打开副本。
      await router.replace(target)
    } finally {
      if (copyNavigation === navigation) copyNavigation = null
    }
  } catch (error) {
    if (ownsRequest()) workflowStore.setRunError(`${t('workflow.copyFailed')}: ${runErrorMessage(error)}`)
  } finally {
    if (sequence === pageCopySequence) copyingWorkflow.value = false
  }
}

async function openWorkflowTemplates() {
  if (workflowStore.workflowTemplatesLoading) {
    return
  }
  const navigationRevision = pageNavigationRevision
  const ownsRequest = () => pageActive && navigationRevision === pageNavigationRevision
  workflowStore.setRunError(null)
  try {
    const templates = await workflowStore.loadWorkflowTemplates()
    if (ownsRequest() && templates) showingWorkflowTemplates.value = true
  } catch (error) {
    if (ownsRequest()) workflowStore.setRunError(`${t('workflow.templatesLoadFailed')}: ${runErrorMessage(error)}`)
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
  return configuredFileId === undefined || configuredFileId === null || String(configuredFileId).trim() === ''
    ? undefined
    : String(configuredFileId).trim()
}

function runErrorMessage(error: unknown) {
  const apiError = toApiError(error, 'workflow')
  const details = [apiError.message, apiError.traceId ? `traceId=${apiError.traceId}` : undefined]
    .filter(Boolean)
    .join(' · ')
  return details || t('workflow.runFailedUnknown')
}

function blockInvalidRunInput() {
  const missingInput = preflightIssues.value.find((issue) => issue.code === 'missingInputFile')
  if (preflightIssues.value.some((issue) => issue.level === 'blocking')) {
    showPreflight.value = true
    if (missingInput) {
      workflowStore.setRunError(t('workflow.runRequiresFileId'))
      void locatePreflightIssue(missingInput)
    }
    return true
  }
  return false
}

async function startRun() {
  if (runButtonBusy.value || workflowStore.saving) {
    return
  }

  if (blockInvalidRunInput()) return
  const missingPromptInput = runPromptInputs.value.find(({ variable }) => !runPromptValues.value[variable]?.trim())
  if (missingPromptInput) {
    runPromptInputError.value = t('workflow.runPromptInputRequired', { variable: missingPromptInput.variable })
    return
  }
  runPromptInputError.value = ''
  const promptVariables = promptRunVariables()
  startingRun.value = true
  const operation = {
    generation: startNavigationGeneration,
    workflowId: workflowStore.workflowId,
    canonicalRoute: undefined as string | undefined,
  }
  activeRunStart = operation
  // 未保存模板共享 new 身份；派发前必须仍是点击时的画布，派发后保留原运行回执。
  const editRevision = workflowStore.editRevision
  let dispatched = false
  const ownsOperation = () => activeRunStart === operation
    && operation.generation === startNavigationGeneration
  const ownsWorkflow = () => ownsOperation() && operation.workflowId === workflowStore.workflowId
    && (dispatched || workflowStore.editRevision === editRevision)
  const projectId = resolveWorkflowProjectId()
  workflowStore.setRunError(null)
  try {
    await runStore.loadRuns({ selectDefault: false, workflowId: operation.workflowId })
    if (!ownsWorkflow()) return
    if (selectedInputFileId()) {
      await fileStore.loadFiles()
      if (!ownsWorkflow()) return
    }
    if (blockInvalidRunInput()) return
    // 只提交用户本次明确配置的输入，不从全局文件列表猜测。
    const fileId = selectedInputFileId()

    const intent = workflowStartIntent({
      id: workflowStore.workflowId,
      name: workflowStore.workflowName,
      nodes: workflowStore.nodes,
      edges: workflowStore.edges,
    }, fileId, promptVariables)
    // 上次回执失败不代表未启动；改配置必须明确选择新运行，不能静默重复执行。
    if (pendingStart && pendingStart.intent !== intent
      && !window.confirm(t('workflow.runChangedIntentConfirm'))) return

    const submittedWorkflow = {
      workflowName: workflowStore.workflowName,
      nodes: workflowStore.nodes.map((node) => ({ ...node, data: { ...node.data } })),
    }
    await workflowStore.saveCurrentWorkflow({
      allowMockFallback: false,
      projectId,
    })
    // 保存可能因导航或更新的画布而失效，不能继续读取别的工作流并启动。
    if (!ownsOperation() || workflowStore.editRevision !== editRevision) return
    operation.workflowId = workflowStore.workflowId
    if (projectId) {
      projectStore.linkWorkflowToProject(String(projectId), operation.workflowId)
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
    dispatched = true
    const result = await workflowApi.startRun(
      operation.workflowId,
      { ...promptVariables, ...(fileId ? { fileId } : {}) },
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

function handleCopilotWorkflowDraft(request: CopilotWorkflowDraftApplyRequest, allowUnavailableCustomDrafts = false) {
  const applied = workflowStore.applyCopilotWorkflowDraft(request, { allowUnavailableCustomDrafts })
  if (applied) {
    if (!workflowStore.nodes.some((node) => node.id === uiStore.selectedNodeId)) uiStore.setSelectedNode(null)
    void canvasRef.value?.fitCanvas()
  }
  return applied
}

async function saveCopilotCustomNodeDrafts(definitions: CustomDefinition[], signal?: AbortSignal) {
  await workflowStore.saveCustomDefinitions(mergeCustomDefinitions(workflowStore.customDefinitions, definitions), false, signal)
}

function handleCopilotCanvasEdit(request: CopilotWorkflowDraftApplyRequest) {
  return handleCopilotWorkflowDraft(request, true)
}
</script>

<template>
  <UnsavedNavigationDialog :open="Boolean(pendingNavigation)" :busy="leaveSaveBusy || workflowStore.saving" :error="leaveSaveError" @save="saveBeforeLeaving" @discard="settleNavigation(true)" @stay="settleNavigation(false)" />
  <div class="h-full min-h-0" :inert="Boolean(pendingNavigation) || undefined" @pointerdown.capture="noteEditorInteraction" @wheel.capture.passive="noteEditorInteraction" @keydown.capture="noteEditorInteraction" @input.capture="noteEditorInteraction">
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
        <p
          v-if="workflowStore.saveRecovery && ['reconciling', 'committed', 'committedWithNewerEdits'].includes(workflowStore.saveRecovery.status)"
          class="mt-2 rounded-md border border-primary/30 bg-primary-soft/40 px-3 py-2 text-xs font-medium text-primary"
          role="status"
          data-testid="save-recovery-hint"
        >
          {{ workflowStore.saveRecovery.message }}
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

    <section v-if="runPromptInputs.length" data-testid="workflow-run-inputs" class="mx-5 mt-4 space-y-3 rounded-xl border border-app-border bg-white p-4 shadow-sm">
      <h2 class="text-sm font-semibold text-text-primary">{{ t('workflow.runPromptInputsTitle') }}</h2>
      <label v-for="input in runPromptInputs" :key="input.variable" class="block">
        <span class="mb-2 block text-sm font-medium text-text-primary">{{ t('workflow.runPromptInputLabel', { variable: input.variable }) }}</span>
        <textarea
          class="min-h-24 w-full resize-y rounded-lg border border-app-border bg-app-bg2 px-3 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
          :aria-label="t('workflow.runPromptInputLabel', { variable: input.variable })"
          :data-run-input="input.variable"
          :disabled="runButtonBusy || workflowStore.saving"
          :value="runPromptValues[input.variable] ?? ''"
          @input="updateRunPromptValue(input.variable, $event)"
        />
        <p class="mt-1 text-xs text-text-muted">{{ input.nodeLabels.join(', ') }}</p>
      </label>
      <p v-if="runPromptInputError" data-run-input-error role="alert" class="text-sm text-status-error">{{ runPromptInputError }}</p>
    </section>

    <div class="max-h-[45vh] overflow-y-auto"><RunNodeRecoveryBanner v-if="route.query.sourceRunId || route.query.nodeId" :workflow-id="workflowStore.workflowId" :definition-id="workflowStore.backendDefinitionId" :version="workflowStore.backendVersion" :nodes="workflowStore.nodes" :node-id="routeQueryString(route.query.nodeId)" :source-run-id="routeQueryString(route.query.sourceRunId)" :return-location="routeQueryString(route.query.runReturnLocation)" :interaction-revision="editorInteractionRevision" @auto-locate="locateSourceRunNode" @locate="locateSourceRunNode" /><WorkflowStarterGuide v-if="showStarterGuide && supportsStarterGuide" :nodes="workflowStore.nodes" :run="currentWorkflowRun" :busy="runButtonBusy || workflowStore.saving" @locate="locateStarterNode" @run="startGuidedRun" @results="openGuidedResults" @close="showStarterGuide = false" /><WorkflowPreflight v-if="showPreflight" :issues="preflightIssues" @close="showPreflight = false" @locate="locatePreflightIssue" /></div>
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
            :apply-canvas-edit="handleCopilotCanvasEdit"
            :save-custom-node-drafts="saveCopilotCustomNodeDrafts"
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
  </div>
</template>
