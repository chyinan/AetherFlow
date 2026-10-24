<script setup lang="ts">
// pattern: Imperative Shell
import { LoaderCircle, PanelRightClose, Send, Sparkles, SquarePen } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { toApiError } from '@/api/client/apiError'
import {
  actionMessageFor,
  buildWorkflowCopilotContext,
  buildCopilotWorkflowPlanGraph,
  buildWorkflowPlannerContext,
  recommendNextNodeAction,
  redactCopilotValue,
  workflowCopilotPrompt,
  type WorkflowCopilotActionMessage,
  type WorkflowCopilotCanvasAction,
  type WorkflowCopilotIntent,
  type WorkflowCopilotSnapshot,
} from '@/services/copilot/workflowCopilotActions'
import { copilotApi } from '@/services/api/copilotApi'
import { renderCopilotMarkdown } from '@/services/copilot/copilotMarkdown'
import { buildCanvasEditContext, compileCanvasEdit } from '@/services/copilot/copilotCanvasEdit'
import { hasCustomNodeDraftOperations, prepareCustomNodeDraft } from '@/services/copilot/copilotCustomNodeDraft'
import { customDefinitionKey, customNodeTemplate, type CustomDefinition } from '@/utils/customNodes'
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import { UNCONFIRMED_CONVERSATION, conversationSessionKey, readConversationSelection, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
import { modelApi } from '@/services/api/modelApi'
import { workflowApi } from '@/services/api/workflowApi'
import type { CopilotMessage } from '@/types/copilot'
import type { CopilotWorkflowDraftApplyRequest, CopilotWorkflowPlan } from '@/types/copilotWorkflowPlan'
import type { ModelCatalogItem, ModelProvider } from '@/types/model'
import type { WorkflowDefinition } from '@/types/workflow'

const props = defineProps<{
  context?: WorkflowCopilotSnapshot
  applyWorkflowDraft?: (draft: CopilotWorkflowDraftApplyRequest) => boolean
  applyCanvasEdit?: (draft: CopilotWorkflowDraftApplyRequest) => boolean
  saveCustomNodeDrafts?: (definitions: CustomDefinition[], signal?: AbortSignal) => Promise<void>
}>()
type CustomNodePreview = {
  definitions: CustomDefinition[]
  canvasEdit: CopilotCanvasEdit | null
  snapshot: WorkflowCopilotSnapshot
  base: NonNullable<ReturnType<typeof currentPlannerBase>>
  status: 'pending' | 'applying' | 'applied' | 'cancelled'
  saved: boolean
  error: string
  validation: { structurallyValid: boolean | null; runtimeReady: boolean | null; issues: string[] } | null
}
const customNodePreviews = ref(new Map<string, CustomNodePreview>())
let customNodeController: AbortController | null = null
const savingCustomNodeDraft = ref(false)
const directEditMode = ref(Boolean(props.applyCanvasEdit))
const canvasEditResults = ref(new Map<string, { success: boolean; text: string }>())
const canvasEditPendingId = ref<string | null>(null)
const prompt = ref('')
const loading = ref(false)
const conversationSelectionPending = ref(false)
const conversationIdentityUnconfirmed = ref(false)
const interactionPending = computed(() => loading.value || savingCustomNodeDraft.value || conversationSelectionPending.value || conversationIdentityUnconfirmed.value)
const modelsLoading = ref(false)
const models = ref<ModelCatalogItem[]>([])
const providers = ref<ModelProvider[]>([])
const selectedModelId = ref('')
const conversationId = ref<string>()
const historyNotice = ref('')
const appliedActionIds = ref(new Set<string>())
const plannerMode = ref(false)
const plannerController = ref<AbortController | null>(null)
const chatController = ref<AbortController | null>(null)
const plannerPendingMessageId = ref<string | null>(null)
const cancelledPlanMessageId = ref<string | null>(null)
const applyingPlan = ref(false)
const planPreview = ref<{
  messageId: string
  baseWorkflowId: string
  baseEditRevision: number
  baseDefinitionId: number | null
  baseVersion: number | null
  baseFingerprint: string
  workflow: WorkflowDefinition
  stale: boolean
  applied: boolean
  structurallyValid: boolean | null
  runtimeReady: boolean | null
  issues: string[]
} | null>(null)
let planValidationSequence = 0
let conversationLoadSequence = 0
let plannerSessionSequence = 0
// 用户主动切换模式（对话/直接编辑画布）的代次，用于让迟到历史尊重用户的选择。
let explicitModeChoiceSequence = 0
let panelDisposed = false
// 待确认草稿要让模型看到精确 schema：字段对象位于深度 3，默认脱敏会把它们整体替换为占位符。
const PENDING_DRAFT_REDACT_DEPTH = 6
const { locale, t } = useI18n()
const { t: presentationText } = useI18n({ useScope: 'local', messages: {
  'zh-CN': { send: '发送消息' },
  'en-US': { send: 'Send message' },
  'ja-JP': { send: 'メッセージを送信' },
} })
const emit = defineEmits<{
  close: []
  'apply-canvas-action': [action: WorkflowCopilotCanvasAction]
}>()

const messages = ref<CopilotMessage[]>([
  {
    id: 'copilot-welcome',
    role: 'assistant',
    content: t('copilot.welcome'),
    createdAt: nowText(),
  },
])

const quickActions = computed<Array<{ intent: WorkflowCopilotIntent; label: string }>>(() => [
  { intent: 'suggest-next-node', label: t('copilot.quickSuggestNextNode') },
  { intent: 'explain-latest-error', label: t('copilot.quickExplainLatestError') },
  { intent: 'draft-media-summary-workflow', label: t('copilot.quickDraftWorkflow') },
])

const availableModels = computed(() =>
  models.value.filter((model) => model.kind === 'chat' && model.status !== 'disabled'),
)

const selectedModel = computed(() =>
  availableModels.value.find((model) => model.id === selectedModelId.value),
)
const latestPlanMessage = computed(() => [...messages.value].reverse().find((message) => message.role === 'assistant' && message.plan))

function nowText() {
  return new Date().toLocaleTimeString(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function providerTypeOf(providerId: string | undefined) {
  if (!providerId) {
    return undefined
  }
  const provider = providers.value.find((entry) => entry.id === providerId)
  return (provider?.providerType || providerId.replace(/^provider-/, '').replace(/-/g, '_')).toUpperCase()
}

function selectedModelLabel(model: ModelCatalogItem) {
  const provider = providers.value.find((entry) => entry.id === model.providerId)
  return [provider?.name, model.name].filter(Boolean).join(' / ')
}

async function loadModels() {
  modelsLoading.value = true
  try {
    const snapshot = await modelApi.refreshSnapshot()
    providers.value = snapshot.providers
    models.value = snapshot.models
    selectedModelId.value =
      availableModels.value.find((model) => model.status === 'ready')?.id ||
      availableModels.value[0]?.id ||
      ''
  } catch {
    providers.value = []
    models.value = []
    selectedModelId.value = ''
  } finally {
    modelsLoading.value = false
  }
}

async function loadConversationHistory() {
  const loadSequence = ++conversationLoadSequence
  const workflowIdAtStart = props.context?.workflowId
  const projectIdAtStart = props.context?.projectId
  const scopeKeyAtStart = conversationSessionKey(props.context)
  // 记录加载开始时的本地消息，用于判断迟到的历史能否与"本次新增消息"合并。
  const baselineMessageIds = messages.value.map((message) => message.id)
  const modeChoiceAtStart = explicitModeChoiceSequence
  const selection = readConversationSelection(scopeKeyAtStart)
  if (selection === 'new') return
  if (selection === UNCONFIRMED_CONVERSATION) {
    conversationIdentityUnconfirmed.value = true
    historyNotice.value = t('copilot.historyIdentityUnconfirmed')
    return
  }
  // 选择已按用户、项目和工作流（含草稿名称）隔离，临时加载失败不能把续聊变成新会话。
  if (selection) {
    conversationId.value = selection
    // 已确认的会话必须等历史恢复完成才允许续发：提前解锁会让发送按默认画布编辑模式写入错误会话，
    // 代次递增还会让迟到的历史失效，历史里确定的规划模式再也恢复不了。
    conversationSelectionPending.value = true
  }
  const stillCurrent = () => loadSequence === conversationLoadSequence
    && workflowIdAtStart === props.context?.workflowId
    && scopeKeyAtStart === conversationSessionKey(props.context)
  const matchesScope = (item: { projectId?: string; workflowId?: string }) =>
    String(item.projectId ?? '') === String(projectIdAtStart ?? '')
      && (workflowIdAtStart ? item.workflowId === workflowIdAtStart : !item.workflowId)
  const unavailable = () => {
    conversationId.value = undefined
    writeConversationSelection(scopeKeyAtStart, 'new')
    historyNotice.value = t('copilot.historyUnavailable')
  }
  let historyConversationId = selection ?? undefined
  let historyRequested = false
  try {
    // 未保存草稿只能恢复该草稿明确记住的会话，不能复用其他名称的 new 工作流。
    if (!selection && workflowIdAtStart === 'new') return
    const conversations = await copilotApi.listConversations()
    if (!stillCurrent()) return
    const selectedSummary = selection ? conversations.find((item) => item.id === selection) : undefined
    if (selectedSummary && !matchesScope(selectedSummary)) {
      unavailable()
      return
    }
    historyConversationId = selection ?? conversations.find(matchesScope)?.id
    if (!historyConversationId) return
    // 列表只有全局最近若干条；缺席不代表已删除，按当前作用域的已选 ID 读取历史。
    historyRequested = true
    const history = await copilotApi.listMessages(historyConversationId)
    if (!stillCurrent()) {
      // 历史迟到（发送等交互已推进会话）：不能直接丢弃，按补偿分支尽量恢复历史与规划模式。
      adoptLateConversationHistory(history, historyConversationId, {
        workflowIdAtStart, scopeKeyAtStart, baselineMessageIds, modeChoiceAtStart,
      })
      return
    }
    rememberConversation(historyConversationId)
    applyConversationHistory(history)
  } catch (error) {
    if (!stillCurrent()) return
    const apiError = toApiError(error, 'ai')
    if (historyRequested && (apiError.status === 404 || String(apiError.code) === '404')) {
      unavailable()
    } else {
      // 保留已确认的会话选择，重新打开时可重试；不回退到其他会话。
      if (historyConversationId) rememberConversation(historyConversationId)
      historyNotice.value = t('copilot.historyLoadFailed')
    }
  } finally {
    // 成功、失败和作用域失效都统一在这里解锁，避免恢复异常时发送被永久锁死。
    if (stillCurrent()) conversationSelectionPending.value = false
  }
}

/** 历史恢复成功后整体接管消息列表，并按历史里最后一条计划决定发送模式。 */
function applyConversationHistory(history: CopilotMessage[]) {
  if (history.length === 0) return
  messages.value = history
  applyConversationHistoryMode(history)
}

function applyConversationHistoryMode(history: CopilotMessage[]) {
  const planMessage = [...history].reverse().find((message) => message.role === 'assistant' && message.plan)
  if (planMessage) enterPlannerMode()
  else plannerMode.value = false
  if (planMessage?.plan?.status === 'READY') {
    void preparePlanPreview(planMessage)
  } else {
    planPreview.value = null
  }
}

interface LateHistoryLoad {
  workflowIdAtStart: string | undefined
  scopeKeyAtStart: string
  baselineMessageIds: string[]
  modeChoiceAtStart: number
}

/**
 * 迟到历史的补偿：历史结果迟到时不能一丢了之。
 * 只有当前作用域没变、本地仍只有"加载前快照 + 本次新增消息"、用户也没有切走会话或主动改模式时，
 * 才把历史前插并恢复其规划模式；用户刚发出的消息原样保留，不覆盖。
 */
function adoptLateConversationHistory(
  history: CopilotMessage[],
  historyConversationId: string,
  load: LateHistoryLoad,
) {
  if (panelDisposed || history.length === 0) return
  if (load.workflowIdAtStart !== props.context?.workflowId
    || load.scopeKeyAtStart !== conversationSessionKey(props.context)) return
  // 在途请求自己负责收尾，此时回放旧历史会打断流式回复。
  if (loading.value) return
  const currentSelection = readConversationSelection(conversationSessionKey(props.context))
  // 用户点了"新对话"或切到别的会话时，不能把旧会话抢回来。
  if (currentSelection === 'new') return
  if (currentSelection && currentSelection !== UNCONFIRMED_CONVERSATION
    && currentSelection !== historyConversationId) return
  // 本地已经持有另一个会话身份，说明用户已经开始新会话，保持用户选择的上下文。
  if (conversationId.value && conversationId.value !== historyConversationId) return
  // 用户在恢复期间主动选了模式，尊重其选择，不用历史覆盖。
  if (explicitModeChoiceSequence !== load.modeChoiceAtStart) return
  // 本地消息必须仍是加载前快照加本次新增，说明从未并入过其它历史，前插才不会串味。
  if (!load.baselineMessageIds.every((id, index) => messages.value[index]?.id === id)) return
  const localOnly = messages.value.slice(load.baselineMessageIds.length)
  messages.value = [...history, ...localOnly]
  rememberConversation(historyConversationId)
  historyNotice.value = ''
  applyConversationHistoryMode(history)
}

function beginConversationInteraction() {
  conversationLoadSequence += 1
  historyNotice.value = ''
}

function enterPlannerMode() {
  directEditMode.value = false
  plannerMode.value = true
}

function rememberConversation(id: string | undefined) {
  conversationId.value = id
  if (id) {
    conversationIdentityUnconfirmed.value = false
    writeConversationSelection(conversationSessionKey(props.context), id)
  }
}

function resetConversationState() {
  customNodeController?.abort()
  customNodeController = null
  savingCustomNodeDraft.value = false
  customNodePreviews.value.clear()
  conversationLoadSequence += 1
  plannerSessionSequence += 1
  planValidationSequence += 1
  plannerController.value?.abort()
  chatController.value?.abort()
  plannerController.value = null
  chatController.value = null
  plannerPendingMessageId.value = null
  cancelledPlanMessageId.value = null
  canvasEditPendingId.value = null
  canvasEditResults.value.clear()
  appliedActionIds.value.clear()
  loading.value = false
  conversationSelectionPending.value = false
  conversationIdentityUnconfirmed.value = false
  applyingPlan.value = false
  conversationId.value = undefined
  historyNotice.value = ''
  plannerMode.value = false
  planPreview.value = null
  prompt.value = ''
  messages.value = [{ id: 'copilot-welcome', role: 'assistant', content: t('copilot.welcome'), createdAt: nowText() }]
}

function startNewConversation() {
  writeConversationSelection(conversationSessionKey(props.context), 'new')
  resetConversationState()
}

function currentPlannerBase() {
  const context = props.context
  if (!context || typeof context.editRevision !== 'number') {
    return null
  }
  return {
    workflowId: context.workflowId,
    workflowName: context.workflowName,
    projectId: context.projectId ?? undefined,
    editRevision: context.editRevision,
    backendDefinitionId: context.backendDefinitionId ?? null,
    backendVersion: context.backendVersion ?? null,
    graphFingerprint: buildWorkflowPlannerContext(context, locale.value).graphFingerprint,
  }
}

function planBaseIsCurrent(message: CopilotMessage) {
  const current = currentPlannerBase()
  return Boolean(current
    && (message.planBaseFingerprint
      ? message.planBaseFingerprint === current.graphFingerprint
      : typeof message.planBaseRevision === 'number' && message.planBaseRevision === current.editRevision)
    && (message.planBaseVersion ?? null) === current.backendVersion)
}

function pendingPlannerDraftContext() {
  const preview = planPreview.value
  if (!preview || preview.applied || cancelledPlanMessageId.value === preview.messageId) return undefined
  const message = messages.value.find((item) => item.id === preview.messageId)
  if (!message?.plan || message.plan.status !== 'READY' || !message.plan.recipe) return undefined
  return {
    messageId: preview.messageId,
    stale: preview.stale,
    definition: {
      id: preview.workflow.id,
      name: preview.workflow.name,
      nodes: preview.workflow.nodes.map((node) => ({
        id: node.id, kind: node.data.kind, label: node.data.label,
        config: redactCopilotValue(node.data.config),
      })),
      edges: preview.workflow.edges.map((edge) => ({
        id: edge.id, source: edge.source, target: edge.target, label: edge.label ?? '',
      })),
    },
    operations: [
      ...preview.workflow.nodes.map((node) => ({ type: 'add_node', nodeId: node.id, kind: node.data.kind, label: node.data.label })),
      ...preview.workflow.edges.map((edge) => ({ type: 'connect', source: edge.source, target: edge.target, label: edge.label ?? '' })),
    ],
    validation: {
      structurallyValid: preview.structurallyValid,
      runtimeReady: preview.runtimeReady,
      issues: [...preview.issues],
    },
  }
}

function pendingCustomNodeDraftContext() {
  const entry = [...customNodePreviews.value.entries()].reverse()
    .find(([, draft]) => draft.status === 'pending' || draft.status === 'applying')
  if (!entry) return undefined
  const [messageId, draft] = entry
  return {
    messageId,
    baseWorkflowId: draft.base.workflowId,
    baseEditRevision: draft.base.editRevision,
    // 待确认草稿要保留到字段层级，否则模型续改时看不到 inputs/fields/outputs 与 request.headers 的精确结构；
    // 400 字符截断与密钥脱敏仍然生效。
    definition: redactCopilotValue(draft.definitions, '', 0, PENDING_DRAFT_REDACT_DEPTH),
    operations: redactCopilotValue((draft.canvasEdit?.operations ?? []).map((operation) =>
      operation.type === 'create_custom_node'
        ? { type: operation.type, draftId: operation.draftId }
        : operation), '', 0, PENDING_DRAFT_REDACT_DEPTH),
    validation: draft.validation,
    saved: draft.saved,
  }
}

function candidateWorkflow(
  plan: CopilotWorkflowPlan,
  messageId: string,
  base: NonNullable<ReturnType<typeof currentPlannerBase>>,
) {
  const graph = buildCopilotWorkflowPlanGraph(plan, props.context?.templates ?? [], {
    idPrefix: `copilot-plan-${messageId.replace(/[^a-zA-Z0-9-]/g, '-')}`,
  })
  return {
    id: base.workflowId,
    name: base.workflowName,
    ...(base.backendDefinitionId ? { backendDefinitionId: base.backendDefinitionId } : {}),
    ...(base.backendVersion ? { backendVersion: base.backendVersion } : {}),
    ...(base.projectId ? { projectId: base.projectId } : {}),
    nodes: graph.nodes,
    edges: graph.edges,
  } satisfies WorkflowDefinition
}

async function preparePlanPreview(message: CopilotMessage, signal?: AbortSignal) {
  if (!message.plan || message.plan.status !== 'READY' || !message.plan.recipe) {
    planPreview.value = null
    return
  }
  const base = currentPlannerBase()
  if (!base) {
    planPreview.value = null
    return
  }
  let workflow: WorkflowDefinition
  try {
    workflow = candidateWorkflow(message.plan, message.id, base)
  } catch (error) {
    planPreview.value = {
      messageId: message.id,
      baseWorkflowId: base.workflowId,
      baseEditRevision: base.editRevision,
      baseDefinitionId: base.backendDefinitionId,
      baseVersion: base.backendVersion,
      baseFingerprint: base.graphFingerprint,
      workflow: { id: base.workflowId, name: base.workflowName, nodes: [], edges: [] },
      stale: !planBaseIsCurrent(message),
      applied: false,
      structurallyValid: false,
      runtimeReady: false,
      issues: [error instanceof Error ? error.message : t('copilot.planner.validationIssue')],
    }
    return
  }
  const stale = !planBaseIsCurrent(message)
  const sequence = ++planValidationSequence
  planPreview.value = {
    messageId: message.id,
    baseWorkflowId: base.workflowId,
    baseEditRevision: base.editRevision,
    baseDefinitionId: base.backendDefinitionId,
    baseVersion: base.backendVersion,
    baseFingerprint: base.graphFingerprint,
    workflow,
    stale,
    applied: false,
    structurallyValid: null,
    runtimeReady: null,
    issues: [],
  }
  if (stale) return
  try {
    const validation = await workflowApi.validateCopilotDraft(workflow, message.plan.recipe, signal)
    if (sequence !== planValidationSequence || !planPreview.value || planPreview.value.messageId !== message.id) return
    planPreview.value = {
      ...planPreview.value,
      stale: !planBaseIsCurrent(message),
      structurallyValid: validation.structurallyValid,
      runtimeReady: validation.runtimeReady,
      issues: validation.issues ?? [],
    }
  } catch (error) {
    if (sequence !== planValidationSequence || !planPreview.value || planPreview.value.messageId !== message.id) return
    const apiError = toApiError(error, 'workflow')
    planPreview.value = {
      ...planPreview.value,
      stale: !planBaseIsCurrent(message),
      structurallyValid: false,
      runtimeReady: false,
      issues: [apiError.message],
    }
  }
}

interface SendPromptOptions {
  intent?: WorkflowCopilotIntent
  requestText?: string
  action?: WorkflowCopilotActionMessage
}

async function sendPrompt(value = prompt.value, options: SendPromptOptions = {}) {
  if (conversationSelectionPending.value || conversationIdentityUnconfirmed.value) return
  if (directEditMode.value && !options.intent && props.applyCanvasEdit) {
    await sendCanvasEdit(value)
    return
  }
  if (plannerMode.value && !options.intent) {
    await sendWorkflowPlan(value)
    return
  }
  const text = value.trim()
  if (!text || loading.value) {
    return
  }
  beginConversationInteraction()
  const intent = options.intent ?? (props.context ? 'freeform-workflow-question' : undefined)
  const requestText = options.requestText?.trim() || (
    intent ? `${text}\n\n${workflowCopilotPrompt(intent)}` : text
  )
  const sessionAtStart = plannerSessionSequence
  const workflowIdAtStart = props.context?.workflowId
  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    createdAt: nowText(),
  })
  prompt.value = ''
  loading.value = true
  const assistantMessageId = `copilot-stream-${Date.now()}`
  messages.value.push({
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: nowText(),
    action: options.action,
  })
  const controller = new AbortController()
  chatController.value = controller
  const scopeKeyAtStart = conversationSessionKey(props.context)
  const stillCurrent = () => !controller.signal.aborted && chatController.value === controller
    && sessionAtStart === plannerSessionSequence && workflowIdAtStart === props.context?.workflowId
    && scopeKeyAtStart === conversationSessionKey(props.context)
  if (!conversationId.value) {
    // 先记住未确认状态；断线或关闭后不把未知会话悄悄当成可续聊的新会话。
    conversationIdentityUnconfirmed.value = true
    writeConversationSelection(scopeKeyAtStart, UNCONFIRMED_CONVERSATION)
  }
  try {
    const model = selectedModel.value
    const assistantMessage = await copilotApi.stream(requestText, {
      conversationId: conversationId.value,
      workflowId: props.context?.workflowId,
      projectId: props.context?.projectId ? String(props.context.projectId) : undefined,
      displayPrompt: text,
      provider: providerTypeOf(model?.providerId),
      model: model?.name,
      context: intent && props.context
        ? buildWorkflowCopilotContext(intent, props.context)
        : undefined,
      signal: controller.signal,
      onConversation: (id) => {
        if (!stillCurrent()) return
        rememberConversation(id)
      },
      onDelta: (delta) => {
        if (!stillCurrent()) return
        const index = messages.value.findIndex((message) => message.id === assistantMessageId)
        const current = index >= 0 ? messages.value[index] : undefined
        if (current) {
          messages.value[index] = {
            ...current,
            content: current.content + delta,
          }
        }
      },
    })
    if (!stillCurrent()) return
    const assistantMessageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    rememberConversation(assistantMessage.conversationId ?? conversationId.value)
    const current = assistantMessageIndex >= 0 ? messages.value[assistantMessageIndex] : undefined
    if (current) {
      messages.value[assistantMessageIndex] = {
        ...current,
        ...assistantMessage,
        action: options.action,
      }
    }
  } catch (error) {
    if (!stillCurrent()) return
    const assistantMessageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    const apiError = toApiError(error, 'ai')
    const current = assistantMessageIndex >= 0 ? messages.value[assistantMessageIndex] : undefined
    if (current) {
      const failureMessage = t('copilot.sendFailed', { message: apiError.message })
      messages.value[assistantMessageIndex] = {
        ...current,
        content: current.content ? `${current.content}\n\n${failureMessage}` : failureMessage,
      }
    }
  } finally {
    if (chatController.value === controller && sessionAtStart === plannerSessionSequence) {
      chatController.value = null
      loading.value = false
      if (conversationIdentityUnconfirmed.value) historyNotice.value = t('copilot.historyIdentityUnconfirmed')
    }
  }
}

function setDirectEditMode(enabled: boolean) {
  if (interactionPending.value) return
  // 用户主动选模式后，迟到的历史不允许再覆盖这次选择。
  explicitModeChoiceSequence += 1
  beginConversationInteraction()
  directEditMode.value = enabled
  leavePlannerMode()
}

async function sendCanvasEdit(value = prompt.value) {
  const text = value.trim()
  if (!text || interactionPending.value || !props.context || !props.applyCanvasEdit) return
  const snapshot: WorkflowCopilotSnapshot = JSON.parse(JSON.stringify(props.context))
  if (snapshot.nodes.length > 100) return
  const base = currentPlannerBase()
  if (!base) return
  const pendingDraft = pendingCustomNodeDraftContext()
  beginConversationInteraction()
  const session = plannerSessionSequence
  const controller = new AbortController()
  chatController.value = controller
  loading.value = true
  prompt.value = ''
  plannerMode.value = false
  const pendingId = `canvas-edit-${Date.now()}`
  canvasEditPendingId.value = pendingId
  let responseMessageId = pendingId
  messages.value.push({ id: `user-${Date.now()}`, role: 'user', content: text, createdAt: nowText() })
  messages.value.push({ id: pendingId, role: 'assistant', content: t('copilot.editor.working'), createdAt: nowText() })
  const stillCurrent = () => !controller.signal.aborted && session === plannerSessionSequence
    && props.context?.workflowId === snapshot.workflowId
  try {
    const model = selectedModel.value
    const response = await copilotApi.editCanvas(text, {
      conversationId: conversationId.value, workflowId: snapshot.workflowId,
      projectId: snapshot.projectId ? String(snapshot.projectId) : undefined,
      provider: providerTypeOf(model?.providerId), model: model?.name,
      context: {
        ...buildCanvasEditContext(snapshot, locale.value),
        capabilities: { customNodeDrafts: Boolean(props.saveCustomNodeDrafts) },
        ...(pendingDraft ? { pendingDraft } : {}),
        selectedModel: { provider: providerTypeOf(model?.providerId), model: model?.name },
        availableModels: availableModels.value.map((item) => ({ provider: providerTypeOf(item.providerId), model: item.name })),
      }, signal: controller.signal,
    })
    if (!stillCurrent()) return
    const index = messages.value.findIndex((message) => message.id === pendingId)
    if (index < 0) return
    rememberConversation(response.message.conversationId)
    messages.value[index] = response.message
    responseMessageId = response.message.id
    canvasEditPendingId.value = responseMessageId
    if (response.edit.status !== 'READY') return
    if (hasCustomNodeDraftOperations(response.edit)) {
      if (!props.saveCustomNodeDrafts) throw new Error('当前编辑器不支持保存自定义节点草稿。')
      const prepared = prepareCustomNodeDraft(response.edit, snapshot)
      if (!prepared.ok) throw new Error(prepared.error)
      customNodePreviews.value.set(responseMessageId, {
        definitions: prepared.definitions, canvasEdit: prepared.canvasEdit, snapshot, base,
        status: 'pending', saved: false, error: '', validation: null,
      })
      return
    }
    const candidate = compileCanvasEdit(snapshot, response.edit)
    if (!candidate.ok) throw new Error(candidate.error)
    const graph: WorkflowDefinition = {
      id: snapshot.workflowId, name: snapshot.workflowName,
      backendDefinitionId: snapshot.backendDefinitionId ?? undefined, backendVersion: snapshot.backendVersion ?? undefined,
      projectId: snapshot.projectId ?? undefined, nodes: candidate.nodes, edges: candidate.edges,
    }
    const validation = await workflowApi.validateCanvasEdit(graph, controller.signal)
    if (!stillCurrent()) return
    const current = currentPlannerBase()
    if (!current || current.editRevision !== base.editRevision || current.backendDefinitionId !== base.backendDefinitionId
      || current.backendVersion !== base.backendVersion || current.graphFingerprint !== base.graphFingerprint) {
      throw new Error(t('copilot.editor.stale'))
    }
    if (!validation.structurallyValid) throw new Error(validation.issues.join('；') || t('copilot.editor.invalid'))
    const applied = props.applyCanvasEdit({
      baseWorkflowId: base.workflowId, baseEditRevision: base.editRevision,
      baseDefinitionId: base.backendDefinitionId, baseVersion: base.backendVersion,
      nodes: candidate.nodes, edges: candidate.edges,
    })
    if (!applied) throw new Error(t('copilot.editor.stale'))
    canvasEditResults.value.set(response.message.id, {
      success: true,
      text: t('copilot.editor.applied', { count: response.edit.operations.length })
        + (validation.runtimeReady ? '' : `\n${t('copilot.editor.runtimeWarning')} ${validation.issues.join('；')}`),
    })
  } catch (error) {
    if (session !== plannerSessionSequence || props.context?.workflowId !== snapshot.workflowId) return
    const message = messages.value.find((item) => item.id === responseMessageId)
    if (message?.role === 'assistant') {
      const reason = controller.signal.aborted ? t('copilot.editor.cancelled') : toApiError(error, 'ai').message
      if (message.id === pendingId) message.content = reason
      canvasEditResults.value.set(message.id, { success: false, text: t('copilot.editor.notApplied', { reason }) })
    }
  } finally {
    if (chatController.value === controller) { chatController.value = null; canvasEditPendingId.value = null; loading.value = false }
  }
}

function cancelCanvasEdit() {
  chatController.value?.abort()
  const message = messages.value.find((item) => item.id === canvasEditPendingId.value)
  if (message) {
    message.content = t('copilot.editor.cancelled')
    canvasEditResults.value.set(message.id, { success: false, text: t('copilot.editor.cancelled') })
  }
}

function customNodeBaseIsCurrent(preview: CustomNodePreview) {
  const current = currentPlannerBase()
  return Boolean(current && current.workflowId === preview.base.workflowId
    && current.editRevision === preview.base.editRevision
    && current.backendDefinitionId === preview.base.backendDefinitionId
    && current.backendVersion === preview.base.backendVersion
    && current.graphFingerprint === preview.base.graphFingerprint)
}

function cancelCustomNodeDraft(messageId: string) {
  const preview = customNodePreviews.value.get(messageId)
  if (!preview || preview.status === 'applied' || preview.status === 'cancelled') return
  if (preview.status === 'applying') customNodeController?.abort()
  preview.status = 'cancelled'
  preview.error = ''
}

async function confirmCustomNodeDraft(messageId: string) {
  const preview = customNodePreviews.value.get(messageId)
  if (!preview || preview.status !== 'pending' || interactionPending.value || !props.saveCustomNodeDrafts) return
  if (!customNodeBaseIsCurrent(preview)) { preview.error = t('copilot.editor.stale'); return }
  const session = plannerSessionSequence
  const controller = new AbortController()
  customNodeController = controller
  savingCustomNodeDraft.value = true
  preview.status = 'applying'
  preview.error = ''
  const stillCurrent = () => !controller.signal.aborted && session === plannerSessionSequence
    && customNodePreviews.value.get(messageId) === preview
  const ensureCurrent = () => {
    if (!stillCurrent()) throw new DOMException('草稿确认已取消', 'AbortError')
    if (!customNodeBaseIsCurrent(preview)) throw new Error(t('copilot.editor.stale'))
  }
  try {
    // 校验的是待保存模板的准确快照；仅请求结构验证，不启动工作流。
    const snapshot = JSON.parse(JSON.stringify(preview.snapshot)) as WorkflowCopilotSnapshot
    snapshot.templates = [...snapshot.templates.filter((template) => !preview.definitions.some((definition) => {
      const existing = template.config.customDefinition as CustomDefinition | undefined
      return existing && customDefinitionKey(existing) === customDefinitionKey(definition)
    })), ...preview.definitions.map((definition) => customNodeTemplate(definition,
      snapshot.templates.find((template) => !template.config.customDefinition && template.kind === (definition.kind === 'API' ? 'http-request' : 'code'))))]
    // 候选结构来自生成时的整图快照；快照里的运行状态是旧值，
    // 最终提交画布时由 store 按当前画布的最新运行信息协调，不在这里刷新快照。
    const candidate = preview.canvasEdit ? compileCanvasEdit(snapshot, preview.canvasEdit) : null
    if (candidate && !candidate.ok) throw new Error(candidate.error)
    const validation = candidate?.ok ? await workflowApi.validateCanvasEdit({
      id: snapshot.workflowId, name: snapshot.workflowName,
      backendDefinitionId: snapshot.backendDefinitionId ?? undefined, backendVersion: snapshot.backendVersion ?? undefined,
      projectId: snapshot.projectId ?? undefined, nodes: candidate.nodes, edges: candidate.edges,
    }, controller.signal) : null
    preview.validation = validation
      ? { structurallyValid: validation.structurallyValid, runtimeReady: validation.runtimeReady, issues: [...validation.issues] }
      : null
    ensureCurrent()
    if (validation && !validation.structurallyValid) throw new Error(validation.issues.join('；') || t('copilot.editor.invalid'))
    if (!preview.saved) {
      await props.saveCustomNodeDrafts(JSON.parse(JSON.stringify(preview.definitions)) as CustomDefinition[], controller.signal)
      // 写入已完成即记录结果；随后取消也不会误报模板未保存。
      preview.saved = true
    }
    ensureCurrent()
    if (candidate?.ok) {
      const applied = props.applyCanvasEdit?.({
        baseWorkflowId: preview.base.workflowId, baseEditRevision: preview.base.editRevision,
        baseDefinitionId: preview.base.backendDefinitionId, baseVersion: preview.base.backendVersion,
        nodes: candidate.nodes, edges: candidate.edges,
      })
      if (!applied) throw new Error('模板已保存，画布尚未应用。请重试；画布若已改变，请重新生成草稿。')
    }
    preview.status = 'applied'
    canvasEditResults.value.set(messageId, {
      success: true,
      text: candidate ? '模板已保存到本机库，已按 ID 和版本添加到画布，尚未运行。' : '模板已保存到本机库，可从自定义节点列表添加。',
    })
    if (validation && !validation.runtimeReady) {
      canvasEditResults.value.get(messageId)!.text += `\n${t('copilot.editor.runtimeWarning')} ${validation.issues.join('；')}`
    }
  } catch (error) {
    if (stillCurrent()) {
      preview.status = 'pending'
      preview.error = `${preview.saved ? '模板已保存，画布尚未应用。' : ''}${toApiError(error, 'ai').message}`
      if (!preview.validation) {
        preview.validation = { structurallyValid: false, runtimeReady: false, issues: [preview.error] }
      }
    }
  } finally {
    if (customNodeController === controller) {
      customNodeController = null
      savingCustomNodeDraft.value = false
    }
  }
}

async function sendWorkflowPlan(value = prompt.value) {
  const text = value.trim()
  if (!text || interactionPending.value || !props.context) return
  const base = currentPlannerBase()
  if (!base) return
  const pendingDraft = pendingPlannerDraftContext()
  beginConversationInteraction()
  enterPlannerMode()
  cancelledPlanMessageId.value = null
  messages.value.push({
    id: `user-${Date.now()}`,
    role: 'user',
    content: text,
    createdAt: nowText(),
  })
  prompt.value = ''
  loading.value = true
  planPreview.value = null
  const assistantMessageId = `copilot-plan-pending-${Date.now()}`
  plannerPendingMessageId.value = assistantMessageId
  messages.value.push({
    id: assistantMessageId,
    role: 'assistant',
    content: '',
    createdAt: nowText(),
  })
  const controller = new AbortController()
  plannerController.value = controller
  const plannerSessionAtStart = plannerSessionSequence
  const workflowIdAtStart = base.workflowId
  try {
    const model = selectedModel.value
    const assistantMessage = await copilotApi.planWorkflow(text, {
      conversationId: conversationId.value,
      workflowId: base.workflowId,
      projectId: base.projectId ? String(base.projectId) : undefined,
      provider: providerTypeOf(model?.providerId),
      model: model?.name,
      context: {
        ...buildWorkflowPlannerContext(props.context, locale.value),
        ...(pendingDraft ? { pendingDraft } : {}),
      },
      signal: controller.signal,
    })
    const assistantMessageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    if (controller.signal.aborted) {
      if (assistantMessageIndex >= 0) {
        messages.value[assistantMessageIndex] = {
          ...messages.value[assistantMessageIndex],
          content: t('copilot.planner.cancelled'),
        }
      }
      return
    }
    if (plannerSessionAtStart !== plannerSessionSequence || workflowIdAtStart !== props.context?.workflowId
        || assistantMessageIndex < 0) return
    rememberConversation(assistantMessage.conversationId)
    messages.value[assistantMessageIndex] = assistantMessage
    plannerPendingMessageId.value = null
    if (assistantMessage.plan?.status === 'READY') {
      await preparePlanPreview(assistantMessage, controller.signal)
    } else {
      planPreview.value = null
    }
  } catch (error) {
    if (plannerSessionAtStart !== plannerSessionSequence || workflowIdAtStart !== props.context?.workflowId) return
    const assistantMessageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    const current = assistantMessageIndex >= 0 ? messages.value[assistantMessageIndex] : undefined
    if (controller.signal.aborted) {
      if (current) {
        messages.value[assistantMessageIndex] = {
          ...current,
          content: t('copilot.planner.cancelled'),
        }
      }
    } else if (current) {
      const apiError = toApiError(error, 'ai')
      messages.value[assistantMessageIndex] = {
        ...current,
        content: `${t('copilot.sendFailed', { message: apiError.message })}`,
      }
    }
  } finally {
    if (plannerController.value === controller && plannerSessionAtStart === plannerSessionSequence) {
      plannerController.value = null
      plannerPendingMessageId.value = null
      loading.value = false
    }
  }
}

function cancelWorkflowPlan() {
  const messageId = planPreview.value?.messageId ?? plannerPendingMessageId.value
  if (messageId) {
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index >= 0) {
      messages.value[index] = {
        ...messages.value[index],
        content: `${messages.value[index].content}${messages.value[index].content ? '\n' : ''}${t('copilot.planner.cancelled')}`,
      }
      if (messages.value[index].plan) {
        cancelledPlanMessageId.value = messageId
      }
    }
  }
  planValidationSequence += 1
  planPreview.value = null
  plannerController.value?.abort()
  plannerController.value = null
  plannerPendingMessageId.value = null
  loading.value = false
}

function leavePlannerMode() {
  if (plannerController.value) {
    cancelWorkflowPlan()
  }
  plannerMode.value = false
  planPreview.value = null
}

async function runQuickAction(intent: WorkflowCopilotIntent, label: string) {
  if (interactionPending.value) return
  if (directEditMode.value && intent === 'draft-media-summary-workflow' && props.applyCanvasEdit) {
    await sendCanvasEdit(t('copilot.editor.designRequest'))
    return
  }
  if (intent === 'draft-media-summary-workflow') {
    await sendWorkflowPlan(label)
    return
  }
  plannerMode.value = false
  planPreview.value = null
  let action: WorkflowCopilotActionMessage | undefined
  if (intent === 'suggest-next-node' && props.context) {
    const recommendation = recommendNextNodeAction(props.context)
    action = recommendation ? actionMessageFor(recommendation) : undefined
  }
  await sendPrompt(label, {
    intent,
    requestText: `${label}\n\n${workflowCopilotPrompt(intent)}`,
    action,
  })
}

function applyCanvasAction(message: CopilotMessage) {
  if (!message.action || appliedActionIds.value.has(message.id)) {
    return
  }
  emit('apply-canvas-action', message.action.payload)
  appliedActionIds.value = new Set([...appliedActionIds.value, message.id])
}

async function applyWorkflowPlan(message: CopilotMessage) {
  const preview = planPreview.value
  const current = currentPlannerBase()
  if (!message.plan || message.plan.status !== 'READY' || !message.plan.recipe
      || !preview || preview.messageId !== message.id || preview.applied || applyingPlan.value) {
    return
  }
  if (!current || preview.stale || !planBaseIsCurrent(message)) {
    planPreview.value = { ...preview, stale: true, issues: [t('copilot.planner.stale')] }
    return
  }
  const sessionAtStart = plannerSessionSequence
  applyingPlan.value = true
  try {
    const validation = await workflowApi.validateCopilotDraft(preview.workflow, message.plan.recipe)
    const stillCurrent = currentPlannerBase()
    if (sessionAtStart !== plannerSessionSequence || planPreview.value?.messageId !== message.id) return
    if (!stillCurrent
        || stillCurrent.workflowId !== preview.baseWorkflowId
        || stillCurrent.editRevision !== preview.baseEditRevision
        || stillCurrent.backendDefinitionId !== preview.baseDefinitionId
        || stillCurrent.backendVersion !== preview.baseVersion
        || stillCurrent.graphFingerprint !== preview.baseFingerprint) {
      planPreview.value = { ...preview, stale: true, issues: [t('copilot.planner.stale')] }
      return
    }
    if (!validation.structurallyValid || !validation.runtimeReady) {
      planPreview.value = {
        ...preview,
        structurallyValid: validation.structurallyValid,
        runtimeReady: validation.runtimeReady,
        issues: validation.issues?.length ? validation.issues : [t('copilot.planner.runtimeUnavailable')],
      }
      return
    }
    const draft: CopilotWorkflowDraftApplyRequest = {
      baseWorkflowId: preview.baseWorkflowId,
      baseEditRevision: preview.baseEditRevision,
      baseDefinitionId: preview.baseDefinitionId,
      baseVersion: preview.baseVersion,
      nodes: preview.workflow.nodes,
      edges: preview.workflow.edges,
    }
    if (!props.applyWorkflowDraft?.(draft)) {
      planPreview.value = { ...preview, stale: true, issues: [t('copilot.planner.stale')] }
      return
    }
    planPreview.value = {
      ...preview,
      applied: true,
      structurallyValid: validation.structurallyValid,
      runtimeReady: validation.runtimeReady,
      issues: [],
    }
    const index = messages.value.findIndex((item) => item.id === message.id)
    if (index >= 0) {
      messages.value[index] = {
        ...messages.value[index],
        content: `${messages.value[index].content}\n${t('copilot.planner.applied')}`,
      }
    }
  } catch (error) {
    if (sessionAtStart === plannerSessionSequence && planPreview.value?.messageId === message.id) {
      const apiError = toApiError(error, 'workflow')
      planPreview.value = { ...preview, structurallyValid: false, runtimeReady: false, issues: [apiError.message] }
    }
  } finally {
    // 旧会话的最终校验不能解除新会话正在应用的等待锁。
    if (sessionAtStart === plannerSessionSequence) applyingPlan.value = false
  }
}

function isLatestPlan(message: CopilotMessage) {
  return latestPlanMessage.value?.id === message.id
}

function actionButtonLabel(message: CopilotMessage) {
  if (!message.action) {
    return ''
  }
  if (appliedActionIds.value.has(message.id)) {
    return t('copilot.actions.applied')
  }
  const action = message.action.payload
  return t(message.action.labelKey, { node: t(`workflow.catalog.items.${action.nodeKind}.label`) })
}

watch(() => conversationSessionKey(props.context), () => {
  resetConversationState()
  void loadConversationHistory()
})

watch(() => [
  props.context?.editRevision,
  props.context?.backendDefinitionId,
  props.context?.backendVersion,
  props.context ? buildWorkflowPlannerContext(props.context, locale.value).graphFingerprint : '',
], () => {
  const preview = planPreview.value
  const base = currentPlannerBase()
  if (preview && !preview.applied && base
      && (base.editRevision !== preview.baseEditRevision
        || base.backendDefinitionId !== preview.baseDefinitionId
        || base.backendVersion !== preview.baseVersion
        || base.graphFingerprint !== preview.baseFingerprint)) {
    planPreview.value = { ...preview, stale: true, issues: [t('copilot.planner.stale')] }
  }
})

onBeforeUnmount(() => {
  customNodeController?.abort()
  panelDisposed = true
  conversationLoadSequence += 1
  plannerSessionSequence += 1
  planValidationSequence += 1
  plannerController.value?.abort()
  chatController.value?.abort()
})

onMounted(() => {
  void loadModels()
  void loadConversationHistory()
})
</script>

<template>
  <aside class="flex h-full min-h-0 bg-white">
    <div class="flex min-h-0 w-full flex-col">
      <div class="flex h-14 items-center justify-between border-b border-app-border px-4">
        <div class="flex items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-ai-soft text-ai">
            <Sparkles class="h-4 w-4" />
          </span>
          <div>
            <p class="text-sm font-semibold text-text-primary">{{ t('copilot.title') }}</p>
            <p class="text-xs text-text-muted">{{ t('copilot.subtitle') }}</p>
          </div>
        </div>
        <div class="flex items-center gap-1">
        <button type="button" class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-text-secondary transition hover:bg-ai-soft hover:text-ai" :title="t('copilot.newConversationHint')" @click="startNewConversation">
          <SquarePen class="h-3.5 w-3.5" />
          {{ t('copilot.newConversation') }}
        </button>
        <button
          type="button"
          class="grid h-9 w-9 place-items-center rounded-md border border-transparent text-text-secondary transition hover:border-app-border hover:bg-app-muted hover:text-text-primary"
          :title="t('copilot.close')"
          @click="emit('close')"
        >
          <PanelRightClose class="h-4 w-4" />
        </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 border-b border-app-border px-4 py-3">
        <div v-if="props.applyCanvasEdit" class="mb-1 flex w-full rounded-lg bg-app-muted p-1" role="group" :aria-label="t('copilot.editor.modeLabel')">
          <button type="button" class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium" :class="!directEditMode ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted'" :aria-pressed="!directEditMode" :disabled="interactionPending" @click="setDirectEditMode(false)">{{ t('copilot.editor.chatMode') }}</button>
          <button type="button" class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium" :class="directEditMode ? 'bg-white text-ai shadow-sm' : 'text-text-muted'" :aria-pressed="directEditMode" :disabled="interactionPending" @click="setDirectEditMode(true)">{{ t('copilot.editor.editMode') }}</button>
        </div>
        <button
          v-for="item in quickActions"
          :key="item.intent"
          type="button"
          class="rounded-md border border-app-border bg-app-muted px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:bg-ai-soft hover:text-ai disabled:cursor-wait disabled:opacity-55"
          :disabled="interactionPending"
          @click="runQuickAction(item.intent, item.label)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-app-bg2 p-4">
        <p v-if="historyNotice" class="rounded-md border border-status-warning/30 bg-amber-50 p-3 text-xs text-text-secondary" role="status">
          {{ historyNotice }}
        </p>
        <article
          v-for="message in messages"
          :key="message.id"
          class="rounded-lg border p-3 text-sm leading-6 shadow-sm"
          :class="
            message.role === 'assistant'
              ? 'border-ai/15 bg-white text-text-primary'
              : 'ml-6 border-primary/20 bg-primary text-white'
          "
        >
          <div class="mb-1 flex items-center justify-between text-[11px]" :class="message.role === 'assistant' ? 'text-text-muted' : 'text-blue-100'">
            <span>{{ message.role === 'assistant' ? t('copilot.assistant') : t('copilot.user') }}</span>
            <span>{{ message.createdAt }}</span>
          </div>
          <div v-if="message.role === 'assistant'" class="copilot-markdown" v-html="renderCopilotMarkdown(message.content)" />
          <p v-else class="whitespace-pre-line">{{ message.content }}</p>
          <p v-if="canvasEditResults.has(message.id)" class="mt-2 whitespace-pre-line rounded-md border px-2.5 py-2 text-xs leading-5" :class="canvasEditResults.get(message.id)?.success ? 'border-status-success/25 bg-green-50 text-status-success' : 'border-status-warning/30 bg-amber-50 text-status-warning'" role="status">
            {{ canvasEditResults.get(message.id)?.text }}
          </p>
          <section v-if="customNodePreviews.has(message.id)" data-testid="custom-node-preview" class="mt-3 space-y-3 rounded-md border border-app-border bg-app-bg2 p-3 text-xs leading-5" aria-label="自定义节点草稿预览">
            <p class="font-semibold text-text-primary">自定义节点草稿 · 请预览后确认</p>
            <p class="text-text-secondary">确认后保存到当前浏览器的本机模板库，并应用下方画布修改。此操作不会发送 API 请求、执行代码或启用 Python 运行时。</p>
            <div v-for="definition in customNodePreviews.get(message.id)!.definitions" :key="customDefinitionKey(definition)" class="space-y-2">
              <p class="font-medium">{{ definition.name }} · {{ customDefinitionKey(definition) }} · {{ definition.kind === 'CODE' ? 'Python' : 'API' }}</p>
              <p v-if="definition.description">{{ definition.description }}</p>
              <p class="font-medium">{{ definition.kind === 'CODE' ? 'Python 源码' : 'API 请求配置' }}</p>
              <pre class="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded border border-app-border bg-app-muted p-2 font-mono text-text-primary">{{ definition.kind === 'CODE' ? definition.code : JSON.stringify(definition.request, null, 2) }}</pre>
              <details open>
                <summary class="cursor-pointer font-medium">完整模板定义（含输入、表单和输出）</summary>
                <pre class="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono">{{ JSON.stringify(definition, null, 2) }}</pre>
              </details>
            </div>
            <details v-if="customNodePreviews.get(message.id)!.canvasEdit" open>
              <summary class="cursor-pointer font-medium">确认后应用的画布修改</summary>
              <pre class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">{{ JSON.stringify(customNodePreviews.get(message.id)!.canvasEdit!.operations, null, 2) }}</pre>
            </details>
            <p v-if="customNodePreviews.get(message.id)!.status === 'cancelled'" role="status">{{ customNodePreviews.get(message.id)!.saved ? '已取消画布应用；已保存的模板仍保留在本机库。' : '已取消；未添加到画布。' }}</p>
            <p v-if="customNodePreviews.get(message.id)!.error" role="alert" class="text-status-error">{{ customNodePreviews.get(message.id)!.error }}</p>
            <p v-if="customNodePreviews.get(message.id)!.status === 'pending' && !customNodeBaseIsCurrent(customNodePreviews.get(message.id)!)" class="text-status-warning">{{ t('copilot.editor.stale') }}</p>
            <div v-if="['pending', 'applying'].includes(customNodePreviews.get(message.id)!.status)" class="flex flex-wrap gap-2">
              <button type="button" data-testid="custom-node-confirm" class="rounded-md bg-ai px-3 py-1.5 font-medium text-white disabled:opacity-50" :disabled="interactionPending || !customNodeBaseIsCurrent(customNodePreviews.get(message.id)!)" @click="confirmCustomNodeDraft(message.id)">{{ customNodePreviews.get(message.id)!.status === 'applying' ? '正在确认…' : customNodePreviews.get(message.id)!.saved ? '重试应用到画布' : customNodePreviews.get(message.id)!.canvasEdit ? '确认保存并应用到画布' : '确认保存模板' }}</button>
              <button type="button" data-testid="custom-node-cancel" class="rounded-md border border-app-border px-3 py-1.5" @click="cancelCustomNodeDraft(message.id)">取消草稿</button>
            </div>
          </section>
          <section
            v-if="message.role === 'assistant' && message.plan"
            class="mt-3 space-y-2 rounded-md border border-app-border bg-app-bg2 p-3 text-xs leading-5"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-text-primary">
                {{ message.plan.status === 'READY' ? t('copilot.planner.requirements') : message.plan.status === 'NEEDS_CLARIFICATION' ? t('copilot.planner.clarification') : t('copilot.planner.unsupported') }}
              </span>
              <span v-if="message.plan.recipe" class="rounded border border-app-border bg-white px-2 py-0.5 text-[10px] text-text-muted">
                {{ message.plan.recipe === 'MEDIA_SUMMARY' ? t('copilot.planner.recipeMedia') : t('copilot.planner.recipeUrl') }}
              </span>
            </div>
            <p class="text-[11px] text-text-muted">{{ t('copilot.planner.scope') }}</p>

            <div v-if="message.plan.requirements.goal" class="text-text-secondary">
              <span class="font-medium text-text-primary">{{ t('copilot.planner.requirements') }}:</span>
              {{ message.plan.requirements.goal }}
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-text-secondary">
              <span class="font-medium text-text-primary">{{ t('copilot.planner.input') }}</span>
              <span>{{ message.plan.requirements.inputDescription || message.plan.requirements.inputKind }}</span>
              <span class="font-medium text-text-primary">{{ t('copilot.planner.outputFormat') }}</span>
              <span>{{ message.plan.requirements.outputFormat }}</span>
              <span class="font-medium text-text-primary">{{ t('copilot.planner.language') }}</span>
              <span>{{ message.plan.requirements.language }}</span>
              <template v-if="message.plan.requirements.audience">
                <span class="font-medium text-text-primary">{{ t('copilot.planner.audience') }}</span>
                <span>{{ message.plan.requirements.audience }}</span>
              </template>
              <template v-if="message.plan.requirements.instruction">
                <span class="font-medium text-text-primary">{{ t('copilot.planner.instruction') }}</span>
                <span>{{ message.plan.requirements.instruction }}</span>
              </template>
            </div>

            <div v-if="message.plan.requirements.constraints?.length">
              <p class="font-medium text-text-primary">{{ t('copilot.planner.constraints') }}</p>
              <ul class="list-disc space-y-0.5 pl-4 text-text-secondary">
                <li v-for="constraint in message.plan.requirements.constraints" :key="constraint">{{ constraint }}</li>
              </ul>
            </div>
            <div v-if="message.plan.assumptions?.length">
              <p class="font-medium text-text-primary">{{ t('copilot.planner.assumptions') }}</p>
              <ul class="list-disc space-y-0.5 pl-4 text-text-secondary">
                <li v-for="assumption in message.plan.assumptions" :key="assumption">{{ assumption }}</li>
              </ul>
            </div>
            <p v-if="cancelledPlanMessageId === message.id" class="rounded border border-app-border bg-app-muted px-2.5 py-2 text-text-muted">
              {{ t('copilot.planner.cancelled') }}
            </p>
            <div v-if="message.plan.status === 'NEEDS_CLARIFICATION' && message.plan.clarifyingQuestion" class="rounded border border-status-warning/30 bg-amber-50 px-2.5 py-2 font-medium text-status-warning">
              {{ message.plan.clarifyingQuestion }}
            </div>
            <div v-if="message.plan.status === 'READY' && message.plan.steps.length" class="space-y-1">
              <p class="font-medium text-text-primary">{{ t('copilot.planner.steps') }}</p>
              <ol class="list-decimal space-y-0.5 pl-4 text-text-secondary">
                <li v-for="(step, index) in message.plan.steps" :key="`${index}-${step}`">{{ step }}</li>
              </ol>
            </div>

            <div v-if="isLatestPlan(message) && planPreview?.messageId === message.id" class="space-y-2 border-t border-app-border pt-2">
              <p v-if="planPreview.stale" class="text-status-warning">{{ t('copilot.planner.stale') }}</p>
              <p v-else-if="planPreview.structurallyValid === null" class="flex items-center gap-1.5 text-text-muted">
                <LoaderCircle class="h-3.5 w-3.5 animate-spin" />
                {{ t('copilot.planner.validating') }}
              </p>
              <p v-else-if="planPreview.structurallyValid && planPreview.runtimeReady === false" class="text-status-warning">
                {{ t('copilot.planner.runtimeUnavailable') }}
              </p>
              <ul v-if="planPreview.issues.length" class="list-disc space-y-0.5 pl-4 text-status-error">
                <li v-for="issue in planPreview.issues" :key="issue">{{ issue }}</li>
              </ul>
              <p v-if="props.context?.nodes.length && !planPreview.applied" class="rounded border border-status-warning/30 bg-amber-50 px-2.5 py-2 text-status-warning">
                {{ t('copilot.planner.replaceWarning') }}
              </p>
              <button
                v-if="planPreview.applied"
                type="button"
                class="inline-flex items-center rounded-md border border-status-success/25 bg-green-50 px-2.5 py-1.5 text-xs font-medium text-status-success"
                disabled
              >
                {{ t('copilot.planner.applied') }}
              </button>
              <button
                v-else-if="planPreview.structurallyValid && planPreview.runtimeReady && !planPreview.stale"
                type="button"
                class="inline-flex items-center rounded-md border border-ai/25 bg-ai-soft px-2.5 py-1.5 text-xs font-medium text-ai transition hover:border-ai/40 hover:bg-ai/10 disabled:cursor-wait disabled:opacity-55"
                :disabled="applyingPlan"
                @click="applyWorkflowPlan(message)"
              >
                <LoaderCircle v-if="applyingPlan" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {{ t('copilot.planner.apply') }}
              </button>
            </div>
          </section>
          <button
            v-if="message.action"
            type="button"
            class="mt-3 inline-flex max-w-full items-center rounded-md border border-ai/25 bg-ai-soft px-2.5 py-1.5 text-xs font-medium text-ai transition hover:border-ai/40 hover:bg-ai/10 disabled:cursor-default disabled:opacity-55"
            :disabled="appliedActionIds.has(message.id)"
            @click="applyCanvasAction(message)"
          >
            {{ actionButtonLabel(message) }}
          </button>
        </article>
      </div>

      <form class="border-t border-app-border bg-white p-3" @submit.prevent="sendPrompt()">
        <p v-if="directEditMode && props.applyCanvasEdit" class="mb-2 text-xs leading-5 text-text-muted">{{ t('copilot.editor.hint') }}</p>
        <p v-if="directEditMode && props.saveCustomNodeDrafts" class="mb-2 text-xs leading-5 text-text-muted">可以要求生成 API 或 Python 自定义节点；模板会先展示草稿，确认后才保存。</p>
        <div v-if="plannerMode" class="mb-2 flex items-center justify-between gap-2 rounded-md border border-ai/20 bg-ai-soft px-2.5 py-1.5 text-xs text-ai">
          <span class="font-medium">{{ t('copilot.planner.mode') }}</span>
          <button type="button" class="shrink-0 text-text-secondary underline-offset-2 hover:underline" @click="leavePlannerMode">
            {{ t('copilot.planner.leaveMode') }}
          </button>
        </div>
        <label class="mb-2 flex items-center gap-2 text-xs text-text-secondary">
          <span class="shrink-0 font-medium text-text-muted">{{ t('copilot.model') }}</span>
          <select
            v-model="selectedModelId"
            class="min-w-0 flex-1 rounded-md border border-app-border bg-white px-2 py-1.5 text-xs text-text-primary outline-none transition focus:border-ai/50 disabled:bg-app-muted disabled:text-text-muted"
            :disabled="modelsLoading || availableModels.length === 0"
          >
            <option v-if="modelsLoading || availableModels.length === 0" value="" disabled>
              {{ modelsLoading ? t('copilot.modelLoading') : t('copilot.modelUnavailable') }}
            </option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ selectedModelLabel(model) }}
            </option>
          </select>
        </label>
        <div class="flex items-center gap-2 rounded-lg border border-app-border bg-app-muted px-3 py-2 focus-within:border-ai/50 focus-within:bg-white">
          <input
            v-model="prompt"
            class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
            :placeholder="directEditMode ? t('copilot.editor.placeholder') : t('copilot.askPlaceholder')"
            :aria-label="directEditMode ? t('copilot.editor.placeholder') : t('copilot.askPlaceholder')"
          />
          <button class="grid h-8 w-8 place-items-center rounded-md bg-ai text-white disabled:opacity-50" type="submit" :disabled="interactionPending" :aria-label="presentationText('send')" :title="presentationText('send')">
            <Send class="h-4 w-4" />
          </button>
        </div>
        <button v-if="directEditMode && chatController" type="button" class="mt-2 rounded-md border border-app-border px-2.5 py-1.5 text-xs text-text-secondary" @click="cancelCanvasEdit">{{ t('copilot.editor.cancel') }}</button>
        <button
          v-if="plannerController"
          type="button"
          class="mt-2 rounded-md border border-app-border px-2.5 py-1.5 text-xs text-text-secondary transition hover:bg-app-muted"
          @click="cancelWorkflowPlan"
        >
          {{ t('copilot.planner.cancel') }}
        </button>
      </form>
    </div>
  </aside>
</template>

<style scoped>
.copilot-markdown :deep(p) {
  margin: 0.45rem 0;
}

.copilot-markdown :deep(h1),
.copilot-markdown :deep(h2),
.copilot-markdown :deep(h3) {
  margin: 0.75rem 0 0.35rem;
  font-weight: 700;
}

.copilot-markdown :deep(ul),
.copilot-markdown :deep(ol) {
  margin: 0.45rem 0;
  padding-left: 1.25rem;
}

.copilot-markdown :deep(ul) {
  list-style: disc;
}

.copilot-markdown :deep(ol) {
  list-style: decimal;
}

.copilot-markdown :deep(code) {
  border-radius: 0.25rem;
  background: rgb(241 245 249);
  padding: 0.1rem 0.3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
}

.copilot-markdown :deep(pre) {
  overflow-x: auto;
  margin: 0.6rem 0;
  border-radius: 0.45rem;
  background: rgb(15 23 42);
  padding: 0.7rem;
  color: rgb(226 232 240);
}

.copilot-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.copilot-markdown :deep(a) {
  color: rgb(37 99 235);
  text-decoration: underline;
}
</style>
