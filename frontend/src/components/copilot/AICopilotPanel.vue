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
  workflowCopilotPrompt,
  type WorkflowCopilotActionMessage,
  type WorkflowCopilotCanvasAction,
  type WorkflowCopilotIntent,
  type WorkflowCopilotSnapshot,
} from '@/services/copilot/workflowCopilotActions'
import { copilotApi } from '@/services/api/copilotApi'
import { renderCopilotMarkdown } from '@/services/copilot/copilotMarkdown'
import { buildCanvasEditContext, compileCanvasEdit } from '@/services/copilot/copilotCanvasEdit'
import { conversationSessionKey, readConversationSelection, writeConversationSelection } from '@/services/copilot/copilotConversationSession'
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
}>()
const directEditMode = ref(Boolean(props.applyCanvasEdit))
const canvasEditResults = ref(new Map<string, { success: boolean; text: string }>())
const canvasEditPendingId = ref<string | null>(null)
const prompt = ref('')
const loading = ref(false)
const modelsLoading = ref(false)
const models = ref<ModelCatalogItem[]>([])
const providers = ref<ModelProvider[]>([])
const selectedModelId = ref('')
const conversationId = ref<string>()
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
const { locale, t } = useI18n()
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
  const scopeKeyAtStart = conversationSessionKey(props.context)
  const selection = readConversationSelection(scopeKeyAtStart)
  if (selection === 'new') return
  const stillCurrent = () => loadSequence === conversationLoadSequence
    && workflowIdAtStart === props.context?.workflowId
    && scopeKeyAtStart === conversationSessionKey(props.context)
  try {
    const conversations = await copilotApi.listConversations()
    if (!stillCurrent()) return
    const workflowId = workflowIdAtStart
    const scopedConversations = conversations.filter((item) => String(item.projectId ?? '') === String(props.context?.projectId ?? ''))
    const matchingConversations = scopedConversations.filter((item) => workflowId ? item.workflowId === workflowId : !item.workflowId)
    const conversation = selection
      ? matchingConversations.find((item) => item.id === selection)
      : matchingConversations[0]
    if (!conversation) {
      conversationId.value = undefined
      plannerMode.value = false
      planPreview.value = null
      return
    }
    const history = await copilotApi.listMessages(conversation.id)
    if (!stillCurrent()) return
    rememberConversation(conversation.id)
    if (history.length > 0) {
      messages.value = history
      const planMessage = [...history].reverse().find((message) => message.role === 'assistant' && message.plan)
      plannerMode.value = Boolean(planMessage)
      if (planMessage?.plan?.status === 'READY') {
        void preparePlanPreview(planMessage)
      } else {
        planPreview.value = null
      }
    }
  } catch {
    // The welcome message remains available when history storage is unavailable.
  }
}

function rememberConversation(id: string | undefined) {
  conversationId.value = id
  if (id) writeConversationSelection(conversationSessionKey(props.context), id)
}

function resetConversationState() {
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
  applyingPlan.value = false
  conversationId.value = undefined
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
    && ((typeof message.planBaseRevision === 'number'
      && message.planBaseRevision === current.editRevision)
      || (typeof message.planBaseFingerprint === 'string'
        && message.planBaseFingerprint === current.graphFingerprint))
    && (message.planBaseVersion ?? null) === current.backendVersion)
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
      onDelta: (delta) => {
        if (sessionAtStart !== plannerSessionSequence || workflowIdAtStart !== props.context?.workflowId) return
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
    if (sessionAtStart !== plannerSessionSequence || workflowIdAtStart !== props.context?.workflowId) return
    const assistantMessageIndex = messages.value.findIndex((message) => message.id === assistantMessageId)
    rememberConversation(assistantMessage.conversationId)
    const current = assistantMessageIndex >= 0 ? messages.value[assistantMessageIndex] : undefined
    if (current) {
      messages.value[assistantMessageIndex] = {
        ...current,
        ...assistantMessage,
        action: options.action,
      }
    }
  } catch (error) {
    if (sessionAtStart !== plannerSessionSequence || workflowIdAtStart !== props.context?.workflowId) return
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
    }
  }
}

function setDirectEditMode(enabled: boolean) {
  directEditMode.value = enabled
  leavePlannerMode()
}

async function sendCanvasEdit(value = prompt.value) {
  const text = value.trim()
  if (!text || loading.value || !props.context || !props.applyCanvasEdit) return
  const snapshot: WorkflowCopilotSnapshot = JSON.parse(JSON.stringify(props.context))
  if (snapshot.nodes.length > 100) return
  const base = currentPlannerBase()
  if (!base) return
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

async function sendWorkflowPlan(value = prompt.value) {
  const text = value.trim()
  if (!text || loading.value || !props.context) return
  plannerMode.value = true
  cancelledPlanMessageId.value = null
  const base = currentPlannerBase()
  if (!base) return
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
      context: buildWorkflowPlannerContext(props.context, locale.value),
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
    applyingPlan.value = false
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
          <button type="button" class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium" :class="!directEditMode ? 'bg-white text-text-primary shadow-sm' : 'text-text-muted'" :aria-pressed="!directEditMode" :disabled="loading" @click="setDirectEditMode(false)">{{ t('copilot.editor.chatMode') }}</button>
          <button type="button" class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium" :class="directEditMode ? 'bg-white text-ai shadow-sm' : 'text-text-muted'" :aria-pressed="directEditMode" :disabled="loading" @click="setDirectEditMode(true)">{{ t('copilot.editor.editMode') }}</button>
        </div>
        <button
          v-for="item in quickActions"
          :key="item.intent"
          type="button"
          class="rounded-md border border-app-border bg-app-muted px-2.5 py-1.5 text-xs text-text-secondary transition hover:border-ai/30 hover:bg-ai-soft hover:text-ai disabled:cursor-wait disabled:opacity-55"
          :disabled="loading"
          @click="runQuickAction(item.intent, item.label)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto bg-app-bg2 p-4">
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
          />
          <button class="grid h-8 w-8 place-items-center rounded-md bg-ai text-white disabled:opacity-50" type="submit" :disabled="loading">
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
