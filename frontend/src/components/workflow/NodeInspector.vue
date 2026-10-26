<script setup lang="ts">
// pattern: Imperative Shell
import { workflowNodeLabel } from '@/utils/workflowNodeLabel'
import { focusNodeConfigField } from '@/utils/focusNodeConfig'
// pattern: Mixed (needs refactoring)
import {
  BookOpen,
  Brain,
  Braces,
  ChevronDown,
  Code2,
  Database,
  FileText,
  Film,
  GitBranch,
  Hand,
  Languages,
  MessageSquare,
  Mic,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Split,
  TerminalSquare,
  Upload,
  Variable,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import NodeConnectionSelector from './NodeConnectionSelector.vue'
import UpstreamVariableSelector from './UpstreamVariableSelector.vue'
import LoopBodyEditor from './LoopBodyEditor.vue'
import LoopRunResults from './LoopRunResults.vue'
import HttpRequestConfigPanel from './HttpRequestConfigPanel.vue'
import CustomNodeConfigPanel from './CustomNodeConfigPanel.vue'
import ImageInputPicker from './ImageInputPicker.vue'
import ComfyWorkflowPanel from './ComfyWorkflowPanel.vue'
import { hasComfySourceBinding, isComfyPromptSummary } from '@/utils/comfyWorkflow'
import StructuredMappingEditor from './StructuredMappingEditor.vue'
import { defaultMapping } from '@/utils/structuredMapping'
import SubworkflowConfigPanel from './SubworkflowConfigPanel.vue'
import WhisperEnvironmentDialog from './WhisperEnvironmentDialog.vue'
import CapabilitySupportDialog from './CapabilitySupportDialog.vue'
import { capabilitySupportMessages } from './capabilitySupportMessages'
import { capabilityForNode } from '@/utils/capabilitySupport'
import type { ImageConnectionProvider } from '@/api/modules/nodeConnections'
import {
  getNodeCatalog,
  type WorkflowNodeCatalogItem,
  type WorkflowNodeConfigSchema,
} from '@/api/modules/node'
import { useDifyStore } from '@/stores/difyStore'
import { useAuthStore } from '@/stores/authStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowNodeKind } from '@/types/workflow'
import { workflowRequiresFileInput } from '@/utils/workflowInputRequirements'
import { workflowRunBelongsToWorkflow } from '@/utils/workflowRunState'
import { SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS } from '@/utils/knowledgeFileSupport'

type ConfigValue = unknown
type ConfigRecord = Record<string, ConfigValue>

const uiStore = useUiStore()
const workflowStore = useWorkflowStore()
const difyStore = useDifyStore()
const fileStore = useFileStore()
const modelStore = useModelStore()
const runStore = useRunStore()
const authStore = useAuthStore()
const selectedNode = computed(() => {
  const selectedByFlow = workflowStore.nodes.find((node) => node.selected)
  const selectedByStore = workflowStore.nodes.find((node) => node.id === uiStore.selectedNodeId)
  return selectedByFlow ?? selectedByStore ?? null
})
// 上传回执的归属代次：按节点记录，迟到回执不得写入其他节点或覆盖更新的选择。
const inputFileIntents = new Map<string, number>()
let inputFileIntentCounter = 0
watch(() => selectedNode.value?.id, (nextNodeId, previousNodeId) => {
  if (previousNodeId && previousNodeId !== nextNodeId && inputFileIntents.has(previousNodeId)) {
    inputFileIntents.set(previousNodeId, ++inputFileIntentCounter)
  }
}, { flush: 'sync' })
const { t, te } = useI18n()
const { t: ct } = useI18n({ useScope: 'local', messages: capabilitySupportMessages })
const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const activeTab = ref<'settings' | 'lastRun'>('settings')
const dynamicMode = ref<'basic' | 'advanced'>('basic')
const retrievalSettingsExpanded = ref(false)
const nodeCatalog = ref<WorkflowNodeCatalogItem[]>([])
const structuredConfigDraft = ref<Record<string, string>>({})
const structuredConfigErrors = ref<Record<string, string>>({})
const modelCatalogRetryPending = ref(false)
const modelCatalogSelect = ref<HTMLSelectElement | null>(null)
const emit = defineEmits<{
  openCopilot: []
  openLogs: []
}>()

const iconMap: Record<WorkflowNodeKind, Component> = {
  start: Upload,
  prompt: Sparkles,
  'image-generation': Sparkles,
  upscale: SlidersHorizontal,
  'save-image': FileText,
  'url-fetch': Search,
  'http-request': Send,
  upload: Upload,
  whisper: Mic,
  llm: Brain,
  ffmpeg: Film,
  translate: Languages,
  summary: MessageSquare,
  embedding: Database,
  'knowledge-retrieval': BookOpen,
  notify: Send,
  export: FileText,
  output: MessageSquare,
  agent: Brain,
  'question-understand': MessageSquare,
  'question-classifier': Split,
  condition: GitBranch,
  human: Hand,
  iteration: Repeat2,
  loop: RotateCcw,
  subworkflow: GitBranch,
  code: Code2,
  'template-transform': FileText,
  'variable-aggregate': Database,
  'document-extractor': FileText,
  'variable-assigner': Variable,
  'parameter-extractor': Braces,
}

const nodeIcon = computed(() => (selectedNode.value ? iconMap[selectedNode.value.data.kind] : SlidersHorizontal))
const selectedKind = computed(() => selectedNode.value?.data.kind ?? '')
const selectedUnavailableReason = computed(() => {
  const kind = selectedNode.value?.data.kind
  if (!kind) {
    return null
  }
  if (['image-generation', 'upscale'].includes(kind) && String(selectedNode.value?.data.config?.connectionId ?? '').trim()) return null
  const template = workflowStore.templates.find((item) => item.kind === kind)
  return template?.availability?.available === false
    ? template.availability.reason || ct('unavailable')
    : null
})
const selectedCapability = computed(() => capabilityForNode(selectedNode.value?.data.kind))
const capabilityChecking = ref(false)
const capabilityCheckState = ref<'' | 'checked' | 'checkFailed' | 'catalogFailed' | 'superseded' | 'cancelled'>('')
const capabilityContext = computed(() => JSON.stringify([
  workflowStore.workflowId, selectedNode.value?.id, selectedNode.value?.data.kind,
  authStore.token, authStore.user?.id, authStore.user?.userId, authStore.isAdmin,
]))
let capabilityCheckSequence = 0
let inspectorAlive = true
function cancelCapabilityCheck() {
  capabilityCheckSequence += 1
  capabilityChecking.value = false
  capabilityCheckState.value = 'cancelled'
}
async function recheckCapabilities() {
  if (!selectedNode.value || !selectedCapability.value || capabilityChecking.value) return
  const sequence = ++capabilityCheckSequence
  const context = capabilityContext.value
  const isCurrent = () => inspectorAlive && sequence === capabilityCheckSequence && context === capabilityContext.value
  capabilityChecking.value = true
  capabilityCheckState.value = ''
  try {
    // 仅更新能力和目录；现有响应式预检会重算，不保存图、不更改选中节点，也不启动任务。
    const pending = workflowStore.loadNodeTemplates(isCurrent)
    const storeSequence = workflowStore.nodeTemplatesRequestSequence
    const loaded = await pending
    if (!isCurrent()) return
    capabilityCheckState.value = storeSequence !== workflowStore.nodeTemplatesRequestSequence ? 'superseded'
      : !loaded ? 'checkFailed' : !workflowStore.nodeCatalogLoaded ? 'catalogFailed' : 'checked'
  } catch {
    if (isCurrent()) capabilityCheckState.value = 'checkFailed'
  } finally {
    if (isCurrent()) capabilityChecking.value = false
  }
}
watch(capabilityContext, () => {
  capabilityCheckSequence += 1
  capabilityChecking.value = false
  capabilityCheckState.value = ''
}, { flush: 'sync' })
onBeforeUnmount(() => { inspectorAlive = false; capabilityCheckSequence += 1; inputFileIntents.clear() })
const workflowNeedsFileInput = computed(() => workflowRequiresFileInput(workflowStore.nodes))
const imageSchemaKinds = new Set<WorkflowNodeKind>(['prompt', 'image-generation', 'upscale', 'save-image'])
const backendTypeByKind: Partial<Record<WorkflowNodeKind, string>> = {
  prompt: 'PROMPT',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
  'save-image': 'SAVE_IMAGE',
}
// 运行历史仍在加载或读取失败时，全局当前运行可能属于上一个画布。
const currentWorkflowRun = computed(() =>
  runStore.currentRun && workflowRunBelongsToWorkflow(
    runStore.currentRun,
    workflowStore.workflowId,
    workflowStore.backendDefinitionId,
  )
    ? runStore.currentRun
    : null,
)
const selectedRunNode = computed(() =>
  currentWorkflowRun.value?.nodeStates.find((node) => node.nodeId === selectedNode.value?.id),
)
const runtimeText = computed(() =>
  selectedRunNode.value?.output
    ?? selectedNode.value?.data.runtime?.lastResult
    ?? t('workflow.waiting'),
)
const runtimeDurationMs = computed(() =>
  selectedRunNode.value?.durationMs
    ?? selectedNode.value?.data.runtime?.durationMs
    ?? 0,
)
const selectedCatalogItem = computed(() => {
  const backendType = selectedNode.value ? backendTypeByKind[selectedNode.value.data.kind] : undefined
  if (!backendType) {
    return null
  }
  return nodeCatalog.value.find((item) => item.type === backendType || item.nodeType === backendType) ?? null
})
const hasDynamicConfigPanel = computed(() =>
  Boolean(selectedNode.value && imageSchemaKinds.has(selectedNode.value.data.kind) && selectedCatalogItem.value?.configSchema?.length),
)
const isImageConnectionNode = computed(() => selectedKind.value === 'image-generation' || selectedKind.value === 'upscale')
const imageInputFields = new Set(['sourceImage', 'sourceImageVariable'])
const connectionFields = new Set(['connectionId', 'provider', 'checkpoint', 'vae', 'lora', 'sampler', 'scheduler', 'upscaler'])
const dynamicConfigFields = computed(() => (selectedCatalogItem.value?.configSchema ?? [])
  .filter((field) => !isImageConnectionNode.value || (!connectionFields.has(field.name) && !imageInputFields.has(field.name))))
const visibleDynamicConfigFields = computed(() =>
  dynamicConfigFields.value.filter((field) => fieldMode(field) === dynamicMode.value),
)
const hasAdvancedConfigFields = computed(() =>
  dynamicConfigFields.value.some((field) => fieldMode(field) === 'advanced'),
)

const sysVariables = ['sys.user_id', 'sys.app_id', 'sys.workflow_id', 'sys.workflow_run_id']
const classifierVariableSearch = ref('')
const visibleSystemVariables = computed(() => {
  const query = classifierVariableSearch.value.trim().toLowerCase()
  return query ? sysVariables.filter((variable) => variable.toLowerCase().includes(query)) : sysVariables
})

function selectClassifierVariable(variable: string) {
  updateConfig('inputVariable', variable)
}

const fileTypes = computed(() => {
  const template = workflowStore.templates.find((item) => item.kind === 'document-extractor')
  const supported = template?.capabilities?.supportedFileExtensions
  return Array.isArray(supported) && supported.every((item) => typeof item === 'string')
    ? supported
    : [...SUPPORTED_KNOWLEDGE_FILE_EXTENSIONS]
})
// 与 Python 运行时一致：入口恒为单参 main(payload)，示例不得暗示双参数签名。
const defaultPythonCode = 'def main(payload):\n    return payload'
const defaultJinjaTemplate = '{{ arg1 }}'
const conditionOperators = [
  { value: 'EQUALS', labelKey: 'workflow.inspector.conditionOperators.equals' },
  { value: 'NOT_EQUALS', labelKey: 'workflow.inspector.conditionOperators.notEquals' },
  { value: 'EXISTS', labelKey: 'workflow.inspector.conditionOperators.exists' },
  { value: 'NOT_EXISTS', labelKey: 'workflow.inspector.conditionOperators.notExists' },
  { value: 'CONTAINS', labelKey: 'workflow.inspector.conditionOperators.contains' },
  { value: 'GREATER_THAN', labelKey: 'workflow.inspector.conditionOperators.greaterThan' },
  { value: 'LESS_THAN', labelKey: 'workflow.inspector.conditionOperators.lessThan' },
]
const summaryLanguages = ['Chinese', 'English']
const summaryProviders = ['ollama', 'openai']
/** 未配置 Provider 时按服务默认（自动路由）执行，界面不得显示并不存在的选定值。 */
const summaryProviderOptions = computed(() => {
  const configured = textConfig('provider', '').trim()
  const options = [...summaryProviders]
  if (configured && !options.includes(configured)) {
    // 已保存的取值原样列出，界面显示与存储保持一致。
    options.unshift(configured)
  }
  return options
})
const translationSourceLanguages = ['auto', 'zh', 'en']
const translationTargetLanguages = ['Chinese', 'English']
const exportFormats = ['MARKDOWN', 'TXT', 'JSON']
const agentOutputVariables = [
  { name: 'plan', type: 'Object', descriptionKey: 'workflow.inspector.agentPlan' },
  { name: 'actionLog', type: 'String', descriptionKey: 'workflow.inspector.agentActionLog' },
]
const humanOutputVariables = [
  { name: 'approved', type: 'boolean', descriptionKey: 'workflow.inspector.approvalResult' },
  { name: 'approval', type: 'object', descriptionKey: 'workflow.inspector.approvalDetails' },
]
const documentExtractorOutputVariables = [
  { name: 'text', type: 'string', descriptionKey: 'workflow.inspector.extractedText' },
]

const selectableInputFiles = computed(() =>
  fileStore.inputFiles.filter((file) => file.status !== 'failed' && file.backendFileId),
)

const selectedInputFile = computed(() => {
  const fileId = textConfig('fileId', '')
  return selectableInputFiles.value.find((file) => String(file.backendFileId) === fileId)
})

const knowledgeDatasets = computed(() => difyStore.datasets.filter((dataset) => dataset.status === 'ready'))

const selectedKnowledgeDataset = computed(() => {
  const datasetId = textConfig('datasetId', '')
  return knowledgeDatasets.value.find((dataset) => dataset.id === datasetId)
})

const conditionNeedsValue = computed(() =>
  !['EXISTS', 'NOT_EXISTS'].includes(textConfig('operator', 'EXISTS')),
)

const availableChatModels = computed(() =>
  modelStore.models.filter((model) => model.kind === 'chat' && model.status !== 'disabled'),
)

async function retryModelCatalog() {
  if (modelCatalogRetryPending.value || modelStore.loading) return

  const retryNodeId = selectedNode.value?.id
  const retryButton = typeof document !== 'undefined' ? document.activeElement : null
  const restoreFocus = retryButton instanceof HTMLButtonElement
    && retryButton.dataset.action === 'retry-model-catalog'
  modelCatalogRetryPending.value = true
  try {
    // loadModels skips a populated snapshot; refreshStatus deliberately fetches a fresh catalog.
    await modelStore.refreshStatus()
  } finally {
    const shouldRestoreFocus = restoreFocus
      && selectedNode.value?.id === retryNodeId
      && !modelStore.error
      && !modelStore.loading
      && (document.activeElement === retryButton || document.activeElement === document.body)
    modelCatalogRetryPending.value = false
    await nextTick()
    if (shouldRestoreFocus) modelCatalogSelect.value?.focus()
  }
}

function modelOptionLabel(model: { name: string; providerId: string }) {
  const provider = modelStore.providers.find((item) => item.id === model.providerId)
  return provider ? `${model.name} · ${provider.name}` : model.name
}

function normalizedProviderType(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '_')
}

function chatModelProviderType(model: { providerId: string }) {
  const provider = modelStore.providers.find((item) => item.id === model.providerId)
  return (provider?.providerType || model.providerId.replace(/^provider-/, '').replace(/-/g, '_')).trim()
}

/**
 * 按 id 解析下拉选中行。后端 slug 去重会让不同模型共用一个 id，
 * 因此 id 不唯一时按下拉行位置解析，绝不回写成相邻模型；定位失败返回 undefined。
 */
function modelAtSelectedOption(select: HTMLSelectElement) {
  const selectedId = select.value.trim()
  if (!selectedId) return undefined
  const matched = availableChatModels.value.filter((model) => model.id === selectedId)
  if (matched.length === 1) return matched[0]
  const byIndex = select.selectedIndex > 0 ? availableChatModels.value[select.selectedIndex - 1] : undefined
  return byIndex && byIndex.id === selectedId ? byIndex : undefined
}

function selectedLlmModelId() {
  const modelName = textConfig('model', '').trim()
  const configuredProvider = textConfig('provider', '').trim()
  if (!modelName || !configuredProvider) return ''
  return availableChatModels.value.find((model) => model.name === modelName
    && normalizedProviderType(chatModelProviderType(model)) === normalizedProviderType(configuredProvider))?.id ?? ''
}

function handleLlmModelSelection(event: Event) {
  if (!selectedNode.value) return
  const select = event.target as HTMLSelectElement
  const model = modelAtSelectedOption(select)
  if (!model) {
    // 只有显式清空才恢复服务默认 Provider/模型路由；定位失败时保留原配置。
    if (!select.value.trim()) {
      workflowStore.updateNodeConfigValues(selectedNode.value.id, { model: '', provider: '' })
    }
    return
  }
  workflowStore.updateNodeConfigValues(selectedNode.value.id, {
    model: model.name,
    provider: chatModelProviderType(model).toLowerCase(),
  })
}

/** 翻译节点按 Provider/Model 对回显；只保存模型名的历史配置在名称唯一时才回显。 */
function selectedTranslateModelId() {
  const modelName = textConfig('model', '').trim()
  if (!modelName) return ''
  const candidates = availableChatModels.value.filter((model) => model.name === modelName)
  const configuredProvider = textConfig('provider', '').trim()
  if (!configuredProvider) return candidates.length === 1 ? candidates[0].id : ''
  return candidates.find((model) => normalizedProviderType(chatModelProviderType(model))
    === normalizedProviderType(configuredProvider))?.id ?? ''
}

function handleTranslateModelSelection(event: Event) {
  if (!selectedNode.value) return
  const select = event.target as HTMLSelectElement
  const model = modelAtSelectedOption(select)
  if (!model) {
    // 与 LLM 段一致：显式清空即回到服务默认自动路由，定位失败时保持原配置。
    if (!select.value.trim()) {
      workflowStore.updateNodeConfigValues(selectedNode.value.id, { model: '', provider: '' })
    }
    return
  }
  workflowStore.updateNodeConfigValues(selectedNode.value.id, {
    model: model.name,
    provider: chatModelProviderType(model).toLowerCase(),
  })
}

function knowledgeDatasetLabel(dataset: { name: string; documentCount: number; chunkCount: number }) {
  return `${dataset.name} · ${dataset.documentCount} docs · ${dataset.chunkCount} chunks`
}

function nodeLabel(kind: string) {
  const translated = t(`workflow.catalog.items.${kind}.label`)
  return selectedNode.value?.data.kind === kind ? workflowNodeLabel(selectedNode.value.data, translated) : translated
}

function nodeDescription(kind: string) {
  return t(`workflow.catalog.items.${kind}.description`)
}

function isConfigRecord(value: unknown): value is ConfigRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureSelectedNodeConfig() {
  if (!selectedNode.value) {
    return null
  }
  if (!isConfigRecord(selectedNode.value.data.config)) {
    selectedNode.value.data.config = {}
  }
  return selectedNode.value.data.config
}

function selectedConfigEntries() {
  const config = selectedNode.value?.data.config
  return isConfigRecord(config) ? Object.entries(config).filter(([key]) => !isImageConnectionNode.value || (!connectionFields.has(key) && !imageInputFields.has(key))) : []
}

function updateConfig(key: string, value: ConfigValue) {
  if (!selectedNode.value) {
    return
  }
  const config = ensureSelectedNodeConfig()
  if (!config) {
    return
  }
  workflowStore.updateNodeConfig(selectedNode.value.id, key, value)
}

function replaceComfyWorkflow(values: Record<string, unknown>, nodeId: string) {
  workflowStore.updateNodeConfigValues(nodeId, values)
}

function changeTransformMode(event: Event) {
  if (!selectedNode.value) return
  const transformMode = (event.target as HTMLSelectElement).value
  const config = selectedNode.value.data.config ?? {}
  workflowStore.updateNodeConfigValues(selectedNode.value.id, {
    transformMode,
    ...(transformMode === 'structured' && !config.mapping ? { mapping: defaultMapping() } : {}),
    ...(!config.outputVariable || config.outputVariable === (transformMode === 'structured' ? 'renderedText' : 'mappedValue')
      ? { outputVariable: transformMode === 'structured' ? 'mappedValue' : 'renderedText' } : {}),
  })
}

function applyStructuredMapping(values: Record<string, unknown>, nodeId: string) {
  if (selectedNode.value?.id === nodeId) workflowStore.updateNodeConfigValues(nodeId, values)
}

function applyImageConnection(connection: { connectionId: string | undefined; provider: ImageConnectionProvider }, nodeId: string) {
  if (selectedNode.value?.id === nodeId) workflowStore.updateNodeConfigValues(nodeId, connection)
}

function handleConfigFocus(event: Event) {
  const field: unknown = (event as CustomEvent<{ field?: unknown }>).detail?.field
  const nodeId = (event.currentTarget as HTMLElement | null)?.dataset.nodeInspector
  if (typeof field === 'string' && nodeId && nodeId === selectedNode.value?.id) void locateImageConfig(field, nodeId)
}

async function locateImageConfig(field: string, nodeId: string) {
  if (selectedNode.value?.id !== nodeId) return
  activeTab.value = 'settings'
  const schema = dynamicConfigFields.value.find((item) => item.name === field)
  if (schema) dynamicMode.value = fieldMode(schema)
  await nextTick()
  if (selectedNode.value?.id !== nodeId) return
  if (focusNodeConfigField(nodeId, field)) return
  if (connectionFields.has(field) && focusNodeConfigField(nodeId, 'connectionId')) return
  // 旧配置或复合编辑器无对应字段时，仍将焦点移入所选节点，不能声称已聚焦不存在的控件。
  const inspector = Array.from(document.querySelectorAll<HTMLElement>('[data-node-inspector]')).find((element) => element.dataset.nodeInspector === nodeId)
  inspector?.focus()
}

function applyImageInput(values: Record<string, unknown>, nodeId: string) {
  if (selectedNode.value?.id === nodeId) workflowStore.updateNodeConfigValues(nodeId, values)
}

function configValue(key: string, fallback: ConfigValue = '') {
  const config = selectedNode.value?.data.config
  return isConfigRecord(config) ? config[key] ?? fallback : fallback
}

function textConfig(key: string, fallback = '') {
  return String(configValue(key, fallback))
}

function numberConfig(key: string, fallback = 0) {
  const value = Number(configValue(key, fallback))
  return Number.isFinite(value) ? value : fallback
}

function boolConfig(key: string, fallback = false) {
  const value = configValue(key, fallback)
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 'true') {
    return true
  }
  if (value === 'false') {
    return false
  }
  return fallback
}

function handleTextInput(key: string, event: Event) {
  updateConfig(key, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function variableAssignerValue() {
  const config = selectedNode.value?.data.config
  return isConfigRecord(config) && Object.hasOwn(config, 'value') ? config.value : undefined
}

function variableAssignerMode() {
  const configured = textConfig('valueMode', '').trim().toUpperCase()
  if (configured === 'LITERAL' || configured === 'SOURCE_VARIABLE') return configured
  const value = variableAssignerValue()
  return value !== undefined && value !== null && String(value).trim() !== ''
    ? 'LITERAL'
    : textConfig('sourceVariable', '').trim() ? 'SOURCE_VARIABLE' : 'LITERAL'
}

function variableAssignerValueType() {
  const configured = textConfig('valueType', '').trim().toUpperCase()
  if (configured === 'STRING' || configured === 'JSON') return configured
  return typeof variableAssignerValue() === 'string' ? 'STRING' : 'JSON'
}

function variableAssignerJsonText() {
  const config = selectedNode.value?.data.config
  if (isConfigRecord(config) && typeof config.valueJsonText === 'string') return config.valueJsonText
  const value = variableAssignerValue()
  return JSON.stringify(value === undefined ? '' : value, null, 2) ?? 'null'
}

function updateVariableAssigner(values: Record<string, unknown>) {
  if (selectedNode.value?.data.kind !== 'variable-assigner') return
  const config = selectedNode.value.data.config
  // 校验状态改为按 valueJsonText 派生，历史版本存进 config 的错误字段就地失效，避免它继续阻断保存。
  const legacyError = isConfigRecord(config) && typeof config.valueValidationError === 'string' && config.valueValidationError
    ? { valueValidationError: '' }
    : {}
  workflowStore.updateNodeConfigValues(selectedNode.value.id, { ...values, ...legacyError })
}

/**
 * JSON 合法性始终由当前界面文本派生，不再存进 config。
 * config.valueJsonText 在任何输入、模式或类型切换时都保留最新原始文本；
 * config.value 只在解析成功时更新，因此非法文本与已保存值的差异只能靠提示暴露。
 */
const valueValidationError = computed(() => {
  if (variableAssignerValueType() !== 'JSON') return ''
  try {
    JSON.parse(variableAssignerJsonText())
    return ''
  } catch {
    return t('workflow.inspector.invalidJsonValue')
  }
})

function handleVariableAssignerModeChange(event: Event) {
  // 模式切换不得清空 JSON 校验状态：切回固定值时必须继续提示未解析文本。
  updateVariableAssigner({ valueMode: (event.target as HTMLSelectElement).value })
}

function handleVariableAssignerValueTypeChange(event: Event) {
  const valueType = (event.target as HTMLSelectElement).value
  const current = variableAssignerValue()
  if (valueType === 'JSON') {
    const nextValue = current === undefined ? '' : current
    updateVariableAssigner({
      valueMode: 'LITERAL', valueType, value: nextValue,
      valueJsonText: JSON.stringify(nextValue, null, 2) ?? 'null',
    })
    return
  }
  const nextValue = current === undefined || current === null
    ? ''
    : typeof current === 'string' ? current : JSON.stringify(current) ?? String(current)
  updateVariableAssigner({
    valueMode: 'LITERAL', valueType: 'STRING', value: nextValue,
  })
}

function handleVariableAssignerStringInput(event: Event) {
  updateVariableAssigner({
    valueMode: 'LITERAL', valueType: 'STRING',
    value: (event.target as HTMLTextAreaElement).value,
  })
}

function handleVariableAssignerJsonInput(event: Event) {
  const valueJsonText = (event.target as HTMLTextAreaElement).value
  try {
    const value: unknown = JSON.parse(valueJsonText)
    updateVariableAssigner({
      valueMode: 'LITERAL', valueType: 'JSON', value,
      valueJsonText,
    })
  } catch {
    // 解析失败时只保留原始文本，config.value 维持上一次解析成功的值，提示由派生校验给出。
    updateVariableAssigner({
      valueMode: 'LITERAL', valueType: 'JSON', valueJsonText,
    })
  }
}

function metadataFilterErrorMessage(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return ''
  }
  try {
    const parsed = JSON.parse(normalized) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? ''
      : t('workflow.inspector.invalidJson')
  } catch {
    return t('workflow.inspector.invalidJson')
  }
}

const metadataFilterError = computed(() => metadataFilterErrorMessage(textConfig('metadataFilter', '')))

function handleMetadataFilterInput(event: Event) {
  updateConfig('metadataFilter', (event.target as HTMLTextAreaElement).value)
}

function handleNumberInput(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  updateConfig(key, value === '' ? '' : Number(value))
}

function handleToggle(key: string, event: Event) {
  updateConfig(key, (event.target as HTMLInputElement).checked)
}

function isStructuredConfigValue(value: unknown) {
  return Array.isArray(value) || isConfigRecord(value)
}

function structuredConfigText(key: string, value: unknown) {
  return structuredConfigDraft.value[key] ?? JSON.stringify(value, null, 2)
}

function handleStructuredConfigInput(key: string, event: Event) {
  const rawValue = (event.target as HTMLTextAreaElement).value
  structuredConfigDraft.value[key] = rawValue
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (!isStructuredConfigValue(parsed)) {
      throw new Error('structured value must be an object or array')
    }
    delete structuredConfigErrors.value[key]
    updateConfig(key, parsed)
  } catch {
    structuredConfigErrors.value[key] = t('workflow.inspector.invalidJson')
  }
}

function selectedHumanMethods() {
  return textConfig('methods', 'webapp,telegram')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean)
}

function isHumanMethodSelected(method: string) {
  return selectedHumanMethods().includes(method)
}

function toggleHumanMethod(method: string) {
  const methods = selectedHumanMethods()
  const nextMethods = isHumanMethodSelected(method)
    ? methods.filter((item) => item !== method)
    : [...methods, method]
  updateConfig('methods', (nextMethods.length > 0 ? nextMethods : [method]).join(','))
}

function closeInspector() {
  uiStore.setSelectedNode(null)
  workflowStore.setNodes(workflowStore.nodes.map((node) => ({
    ...node,
    selected: false,
  })))
}

function fieldMode(field: WorkflowNodeConfigSchema) {
  return field.ui?.mode === 'advanced' ? 'advanced' : 'basic'
}

function fieldDefaultValue(field: WorkflowNodeConfigSchema) {
  if (field.example !== undefined && field.example !== null) {
    return field.example
  }
  if (field.type === 'NUMBER') {
    return 0
  }
  if (field.type === 'BOOLEAN') {
    return false
  }
  if (field.type === 'ARRAY') {
    return []
  }
  if (field.type === 'OBJECT') {
    return {}
  }
  return ''
}

function fieldCurrentValue(field: WorkflowNodeConfigSchema) {
  return configValue(field.name, fieldDefaultValue(field))
}

function fieldStringValue(field: WorkflowNodeConfigSchema) {
  const value = fieldCurrentValue(field)
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }
  return String(value ?? '')
}

function dynamicFieldLabel(field: WorkflowNodeConfigSchema) {
  const key = `workflow.inspector.imageFields.${field.name}.label`
  return te(key) ? t(key) : field.name
}

function dynamicFieldDescription(field: WorkflowNodeConfigSchema) {
  const key = `workflow.inspector.imageFields.${field.name}.description`
  return te(key) ? t(key) : field.description ?? ''
}

function selectOptions(field: WorkflowNodeConfigSchema) {
  return field.options ?? []
}

function fieldSelectValue(field: WorkflowNodeConfigSchema) {
  const value = fieldCurrentValue(field)
  if (typeof value === 'string' && value === '') {
    const defaultValue = fieldDefaultValue(field)
    if (typeof defaultValue === 'string' && defaultValue !== '') {
      return defaultValue
    }
    return selectOptions(field)[0] ?? ''
  }
  return String(value ?? '')
}

function isSegmentedField(field: WorkflowNodeConfigSchema) {
  return field.ui?.control === 'segmented' && selectOptions(field).length > 0
}

function isSelectField(field: WorkflowNodeConfigSchema) {
  return field.ui?.control !== 'segmented' && selectOptions(field).length > 0
}

function isBooleanField(field: WorkflowNodeConfigSchema) {
  return field.type === 'BOOLEAN' || field.ui?.control === 'toggle'
}

function isNumberField(field: WorkflowNodeConfigSchema) {
  return field.type === 'NUMBER' || field.ui?.control === 'number'
}

function isTextareaField(field: WorkflowNodeConfigSchema) {
  return field.type === 'OBJECT'
    || field.type === 'ARRAY'
    || ['textarea', 'json', 'lora-list', 'image-list', 'tags'].includes(field.ui?.control ?? '')
}

function parseDynamicFieldValue(field: WorkflowNodeConfigSchema, rawValue: string) {
  if (field.type === 'NUMBER') {
    if (rawValue === '') {
      return ''
    }
    const numericValue = Number(rawValue)
    return Number.isFinite(numericValue) ? numericValue : fieldDefaultValue(field)
  }
  if (field.type === 'BOOLEAN') {
    return rawValue === 'true'
  }
  if (field.type === 'OBJECT' || field.type === 'ARRAY' || ['json', 'lora-list', 'image-list', 'tags'].includes(field.ui?.control ?? '')) {
    try {
      return JSON.parse(rawValue)
    } catch {
      return rawValue
    }
  }
  return rawValue
}

function handleDynamicFieldInput(field: WorkflowNodeConfigSchema, event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  updateConfig(field.name, parseDynamicFieldValue(field, target.value))
}

function handleDynamicFieldToggle(field: WorkflowNodeConfigSchema, event: Event) {
  updateConfig(field.name, (event.target as HTMLInputElement).checked)
}

/** 上传回执归属：绑定发起节点与代次，迟到结果不写入其他节点，也不覆盖更新的选择。 */
function beginInputFileIntent(nodeId: string) {
  const generation = ++inputFileIntentCounter
  inputFileIntents.set(nodeId, generation)
  return generation
}

function isCurrentInputFileIntent(nodeId: string, generation: number) {
  return inputFileIntents.get(nodeId) === generation
}

function applyInputFileToNode(nodeId: string, fileId: ConfigValue, fileName: ConfigValue) {
  workflowStore.updateNodeConfigValues(nodeId, { fileId, fileName })
}

/** 手动改选已有文件同样让更早的上传回执失效。 */
function handleInputFileSelection(event: Event) {
  const node = selectedNode.value
  if (node) {
    beginInputFileIntent(node.id)
  }
  handleTextInput('fileId', event)
}

async function handleInputFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  const node = selectedNode.value
  if (!node) {
    return
  }
  const nodeId = node.id
  const workflowId = workflowStore.workflowId
  // 上传回执同时绑定节点意图与历史代次；撤销后再重做回同值也会作废。
  const editRevisionAtUpload = workflowStore.editRevision
  const generation = beginInputFileIntent(nodeId)
  try {
    const asset = await fileStore.upload(file)
    if (!asset?.backendFileId) {
      return
    }
    // 迟到回执：节点已删除、工作流已切换或已有更新的选择时一律丢弃。
    if (!isCurrentInputFileIntent(nodeId, generation)
      || workflowStore.editRevision !== editRevisionAtUpload) {
      return
    }
    if (workflowStore.workflowId !== workflowId) {
      return
    }
    if (!workflowStore.nodes.some((item) => item.id === nodeId)) {
      return
    }
    applyInputFileToNode(nodeId, asset.backendFileId, asset.name)
  } catch {
    // The file store exposes uploadError for the inspector banner.
  }
}

function openKnowledgePage() {
  void router.push({ name: 'knowledge' })
}

watch(selectedNode, (node) => {
  if (node && node.id !== uiStore.selectedNodeId) {
    uiStore.setSelectedNode(node.id)
  }
  activeTab.value = 'settings'
  dynamicMode.value = 'basic'
  retrievalSettingsExpanded.value = false
  structuredConfigDraft.value = {}
  structuredConfigErrors.value = {}
})

onMounted(() => {
  void modelStore.loadModels()
  void difyStore.refreshDatasets()
  void getNodeCatalog()
    .then((items) => {
      nodeCatalog.value = items
    })
    .catch(() => {
      nodeCatalog.value = []
    })
})
</script>

<template>
  <aside class="relative z-20 flex h-full min-h-0 w-full flex-col border-l border-app-border bg-white lg:w-[420px]">
    <div v-if="selectedNode" :data-node-inspector="selectedNode.id" tabindex="-1" class="flex min-h-0 flex-1 flex-col" @aetherflow-focus-config="handleConfigFocus">
      <header class="border-b border-app-border bg-white">
        <div class="flex items-start justify-between gap-3 px-5 pt-5">
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary shadow-sm">
              <component :is="nodeIcon" class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-xl font-semibold text-text-primary">{{ nodeLabel(selectedNode.data.kind) }}</p>
              <p class="mt-1 truncate text-xs text-text-muted">{{ selectedNode.data.kind }}</p>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1 text-text-muted">
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-app-bg2 hover:text-primary"
              :title="t('workflow.openLogs')"
              :aria-label="t('workflow.openLogs')"
              @click="emit('openLogs')"
            >
              <BookOpen class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-ai-soft hover:text-ai"
              :title="t('workflow.openCopilot')"
              :aria-label="t('workflow.openCopilot')"
              @click="emit('openCopilot')"
            >
              <Sparkles class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-app-bg2 hover:text-text-primary"
              :title="t('common.close')"
              :aria-label="t('common.close')"
              @click="closeInspector"
            >
              <X class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="mt-5 flex items-center gap-7 px-5">
          <button
            type="button"
            class="border-b-2 pb-3 text-sm font-semibold"
            :class="activeTab === 'settings' ? 'border-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'"
            @click="activeTab = 'settings'"
          >
            {{ t('workflow.inspector.settings') }}
          </button>
          <button
            type="button"
            class="border-b-2 pb-3 text-sm font-semibold"
            :class="activeTab === 'lastRun' ? 'border-primary text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'"
            @click="activeTab = 'lastRun'"
          >
            {{ t('workflow.inspector.lastRun') }}
          </button>
        </div>
      </header>

      <div v-if="selectedUnavailableReason" class="mx-5 mt-4 rounded-lg border border-status-warning/30 bg-amber-50 px-3 py-2 text-sm leading-6 text-status-warning">
        {{ t('workflow.capabilityUnavailable') }}：{{ selectedUnavailableReason }}
      </div>
      <section v-if="selectedCapability" data-testid="node-capability-recovery" :aria-busy="capabilityChecking" class="mx-5 mt-3 space-y-2">
        <div class="flex flex-wrap gap-2">
          <button type="button" data-action="recheck-node-capabilities" :disabled="capabilityChecking" class="rounded-lg border border-app-border px-3 py-2 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50" @click="recheckCapabilities">{{ ct(capabilityChecking ? 'checking' : 'check') }}</button>
          <button v-if="capabilityChecking" type="button" data-action="cancel-node-capabilities" class="rounded-lg px-3 py-2 text-xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="cancelCapabilityCheck">{{ ct('cancel') }}</button>
          <CapabilitySupportDialog v-if="selectedUnavailableReason || capabilityCheckState === 'checkFailed' || capabilityCheckState === 'catalogFailed'" :key="capabilityContext" :capability-type="selectedCapability" :category="!workflowStore.capabilitiesLoaded || capabilityCheckState === 'checkFailed' || capabilityCheckState === 'catalogFailed' ? 'CHECK_FAILED' : 'CAPABILITY_UNAVAILABLE'" :workflow-id="workflowStore.workflowId" :node-id="selectedNode.id" />
        </div>
        <p v-if="capabilityCheckState" data-testid="node-capability-check-status" :role="capabilityCheckState === 'checkFailed' || capabilityCheckState === 'catalogFailed' ? 'alert' : 'status'" class="text-xs leading-5 text-text-secondary">{{ ct(capabilityCheckState) }}</p>
      </section>

      <div v-if="activeTab === 'settings'" class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="isImageConnectionNode" class="px-5 pt-5">
          <NodeConnectionSelector
            :key="selectedNode.id"
            :node-id="selectedNode.id"
            :node-type="selectedKind === 'upscale' ? 'UPSCALE' : 'IMAGE_GENERATION'"
            :config="selectedNode.data.config"
            @apply="applyImageConnection"
            @locate-config="locateImageConfig"
            @update-config="updateConfig"
            @saved="workflowStore.loadNodeTemplates()"
          />
          <ImageInputPicker
            v-if="selectedKind === 'upscale' || textConfig('mode', 'txt2img') === 'img2img' || textConfig('sourceImage', '') || textConfig('sourceImageVariable', '') || hasComfySourceBinding(selectedNode.data.config)"
            :key="`image-${selectedNode.id}`"
            class="mt-4"
            :node-id="selectedNode.id"
            :config="selectedNode.data.config"
            :nodes="workflowStore.nodes"
            :edges="workflowStore.edges"
            @apply="applyImageInput"
          />
          <ComfyWorkflowPanel
            v-if="selectedKind === 'image-generation' && textConfig('provider', '') === 'COMFYUI' && (selectedNode.data.config.workflow || selectedNode.data.config.workflowJson)"
            :key="`comfy-${selectedNode.id}`" :node-id="selectedNode.id" :config="selectedNode.data.config" @update="updateConfig" @replace-workflow="replaceComfyWorkflow"
          />
        </div>
        <CustomNodeConfigPanel v-if="selectedNode.data.config.customDefinition" :key="selectedNode.id" :config="selectedNode.data.config" @update="updateConfig" />
        <section v-else-if="selectedKind === 'start'" class="space-y-5 p-5">
          <div v-if="!workflowNeedsFileInput" class="rounded-xl border border-status-success/25 bg-green-50 p-4">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.noFileInputTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.noFileInputHint') }}</p>
          </div>
          <template v-else>
          <div class="rounded-xl border border-primary/20 bg-primary-soft/60 p-4">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputFileTitle') }} <span class="text-status-error">*</span></p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.inputFileHint') }}</p>
            <div v-if="selectedInputFile" class="mt-3 rounded-lg border border-primary/20 bg-white p-3">
              <p class="truncate text-sm font-semibold text-text-primary">{{ selectedInputFile.name }}</p>
              <p class="mt-1 truncate text-xs text-text-muted">fileId={{ selectedInputFile.backendFileId }} · {{ selectedInputFile.size }} · {{ selectedInputFile.mime }}</p>
            </div>
            <p v-else class="mt-3 rounded-lg border border-dashed border-status-warning/40 bg-amber-50 px-3 py-2 text-sm font-medium text-status-warning">
              {{ t('workflow.inspector.inputFileRequired') }}
            </p>
            <p v-if="fileStore.uploadError" class="mt-3 rounded-lg border border-status-error/25 bg-red-50 px-3 py-2 text-sm font-medium text-status-error">
              {{ t('workflow.inspector.uploadFailed') }}：{{ fileStore.uploadError }}
            </p>
          </div>

          <input ref="fileInput" type="file" class="hidden" accept="video/*,audio/*,.mp4,.mov,.mkv,.mp3,.wav,.m4a,.aac,.flac" @change="handleInputFileUpload" />
          <button
            type="button"
            class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-white shadow-node disabled:opacity-60"
            :disabled="fileStore.uploading"
            @click="fileInput?.click()"
          >
            <Upload class="h-4 w-4" />
            {{ fileStore.uploading ? `${t('workflow.inspector.uploading')} ${fileStore.uploadProgress}%` : t('workflow.inspector.uploadVideoFile') }}
          </button>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.selectExistingFile') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="fileId" :value="textConfig('fileId', '')" @change="handleInputFileSelection($event)">
              <option value="">{{ t('workflow.inspector.noFileSelected') }}</option>
              <option v-for="file in selectableInputFiles" :key="file.id" :value="file.backendFileId">
                {{ file.name }} · fileId={{ file.backendFileId }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.runtimeVariable') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-app-bg2 px-3 py-3 text-sm outline-none" value="fileId" readonly />
            <p class="mt-2 text-xs text-text-muted">{{ t('workflow.inspector.runtimeVariableHint') }}</p>
          </label>
          </template>
        </section>

        <HttpRequestConfigPanel v-else-if="selectedKind === 'http-request'" :config="selectedNode.data.config" @update="updateConfig" />

        <section v-else-if="selectedKind === 'upload'" class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.videoMetadataTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.fileUrlOutput') }}</p>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.fileIdVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="fileIdVariable" :value="textConfig('fileIdVariable', 'fileId')" @input="handleTextInput('fileIdVariable', $event)" />
          </label>
        </section>

        <section v-else-if="selectedKind === 'ffmpeg'" class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.videoMetadataTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.videoMetadataHint') }}</p>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.fileUrlVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="fileUrlVariable" :value="textConfig('fileUrlVariable', 'fileUrl')" @input="handleTextInput('fileUrlVariable', $event)" />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">Operation</span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="operation" :value="textConfig('operation', 'extract-audio')" @change="handleTextInput('operation', $event)">
                <option value="extract-audio">extract-audio</option>
                <option value="convert">convert</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">Output format</span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="outputFormat" :value="textConfig('outputFormat', 'wav')" @change="handleTextInput('outputFormat', $event)">
                <option value="wav">wav</option>
                <option value="mp3">mp3</option>
                <option value="m4a">m4a</option>
                <option value="aac">aac</option>
                <option value="mp4">mp4</option>
              </select>
            </label>
          </div>
          <div class="rounded-lg border border-app-border bg-white p-3 text-sm text-text-secondary">
            <p><span class="font-semibold text-text-primary">mediaFileName</span>：generated media artifact</p>
            <p class="mt-1"><span class="font-semibold text-text-primary">mediaSize</span>：output bytes (maximum 50 MiB)</p>
          </div>
        </section>

        <section v-else-if="selectedKind === 'whisper'" class="space-y-5 p-5">
          <div data-config-field="whisperEnvironment" tabindex="-1"><WhisperEnvironmentDialog :key="selectedNode.id" :node-id="selectedNode.id" :refresh-capabilities="workflowStore.loadNodeTemplates" /></div>
          <UpstreamVariableSelector :key="`${selectedNode.id}-fileUrlVariable`" :node-id="selectedNode.id" field="fileUrlVariable" :label="t('workflow.inspector.fileUrlVariable')" :model-value="textConfig('fileUrlVariable', 'fileUrl')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="STRING" :fixed-value-active="Boolean(textConfig('fileUrl', ''))" @update:model-value="updateConfig('fileUrlVariable', $event)" />
          <UpstreamVariableSelector :key="`${selectedNode.id}-fileIdVariable`" :node-id="selectedNode.id" field="fileIdVariable" :label="t('workflow.inspector.fileIdVariable')" :model-value="textConfig('fileIdVariable', 'fileId')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="NUMBER" :fixed-value-active="Boolean(textConfig('fileId', ''))" @update:model-value="updateConfig('fileIdVariable', $event)" />
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.asrLanguage') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="language" :value="textConfig('language', 'auto')" @change="handleTextInput('language', $event)">
              <option value="auto">auto</option>
              <option value="zh">zh</option>
              <option value="en">en</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.asrPrompt') }}</span>
            <textarea class="min-h-28 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="prompt" maxlength="8000" :value="textConfig('prompt', '')" @input="handleTextInput('prompt', $event)" />
            <span class="mt-1 block text-xs text-text-muted">{{ t('workflow.inspector.whisperPromptLimit') }}</span>
          </label>
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3 text-sm text-text-secondary">
            {{ t('workflow.inspector.whisperRuntimeHint') }}
          </div>
        </section>

        <section v-else-if="selectedKind === 'translate'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.textVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="textVariable" :value="textConfig('textVariable', 'transcription')" @input="handleTextInput('textVariable', $event)" />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.sourceLanguage') }}</span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="sourceLanguage" :value="textConfig('sourceLanguage', 'auto')" @change="handleTextInput('sourceLanguage', $event)">
                <option v-for="language in translationSourceLanguages" :key="language" :value="language">{{ language }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.targetLanguage') }}</span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="targetLanguage" :value="textConfig('targetLanguage', 'English')" @change="handleTextInput('targetLanguage', $event)">
                <option v-for="language in translationTargetLanguages" :key="language" :value="language">{{ language }}</option>
              </select>
            </label>
          </div>
          <div class="block">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }}</span>
              <select ref="modelCatalogSelect" class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="model" :aria-busy="modelStore.loading || modelCatalogRetryPending" :aria-describedby="modelStore.loading || modelStore.error || modelCatalogRetryPending ? 'node-model-catalog-status-message' : undefined" :value="selectedTranslateModelId()" @change="handleTranslateModelSelection">
                <option value="">{{ t('workflow.inspector.configureModel') }}</option>
                <option v-for="model in availableChatModels" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
              </select>
            </label>
            <div v-if="modelStore.loading || modelStore.error || modelCatalogRetryPending" data-testid="node-model-catalog-status" :aria-busy="modelStore.loading || modelCatalogRetryPending" class="mt-2 space-y-2">
              <p v-if="modelStore.loading || modelCatalogRetryPending" id="node-model-catalog-status-message" role="status" aria-live="polite" class="text-xs leading-5 text-text-secondary">{{ t('workflow.inspector.modelCatalogLoading') }}</p>
              <p v-else id="node-model-catalog-status-message" role="alert" class="text-xs leading-5 text-status-error">{{ modelStore.error }}</p>
              <button v-if="modelStore.error || modelCatalogRetryPending" type="button" data-action="retry-model-catalog" :aria-disabled="modelStore.loading || modelCatalogRetryPending" class="rounded-lg border border-app-border px-3 py-2 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="retryModelCatalog">{{ t('workflow.inspector.modelCatalogRetry') }}</button>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'summary'" class="space-y-5 p-5">
          <UpstreamVariableSelector :key="`${selectedNode.id}-textVariable`" :node-id="selectedNode.id" field="textVariable" :label="t('workflow.inspector.textVariable')" :model-value="textConfig('textVariable', 'transcription')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="STRING" :fixed-value-active="Boolean(textConfig('text', ''))" @update:model-value="updateConfig('textVariable', $event)" />
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.summaryLanguage') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="language" :value="textConfig('language', 'Chinese')" @change="handleTextInput('language', $event)">
              <option v-for="language in summaryLanguages" :key="language" :value="language">{{ language }}</option>
            </select>
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.provider') }} <span class="text-status-error">*</span></span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="provider" :value="textConfig('provider', '')" @change="handleTextInput('provider', $event)">
                <option value="">{{ t('workflow.inspector.serviceDefault') }}</option>
                <option v-for="provider in summaryProviderOptions" :key="provider" :value="provider">{{ provider }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
              <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="model" :value="textConfig('model', '')" :placeholder="t('workflow.inspector.serviceDefault')" @input="handleTextInput('model', $event)" />
            </label>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.summaryPrompt') }}</span>
            <textarea class="min-h-40 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-primary" data-config-field="prompt" :value="textConfig('prompt', '')" @input="handleTextInput('prompt', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3 text-sm leading-6 text-text-secondary">
            {{ t('workflow.inspector.summaryPromptHint') }}
          </div>
        </section>

        <section v-else-if="selectedKind === 'export'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.exportFormat') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="format" :value="textConfig('format', 'MARKDOWN')" @change="handleTextInput('format', $event)">
              <option v-for="format in exportFormats" :key="format" :value="format">{{ format }}</option>
            </select>
          </label>
          <UpstreamVariableSelector :key="`${selectedNode.id}-sourceVariable`" :node-id="selectedNode.id" field="sourceVariable" :label="t('workflow.inspector.sourceVariable')" :model-value="textConfig('sourceVariable', 'summary')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="" :fixed-value-active="Boolean(textConfig('content', ''))" @update:model-value="updateConfig('sourceVariable', $event)" />
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputFileName') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="fileName" :value="textConfig('fileName', 'meeting-summary.md')" @input="handleTextInput('fileName', $event)" />
          </label>
          <label class="block border-t border-app-border pt-4">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputDirectoryOptional') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none" :placeholder="t('workflow.inspector.outputDirectoryPlaceholder')" data-config-field="outputDirectory" :value="textConfig('outputDirectory', '')" @input="handleTextInput('outputDirectory', $event)" />
            <p class="mt-2 text-xs leading-5 text-text-muted">{{ t('workflow.inspector.outputDirectoryHint') }}</p>
          </label>
        </section>

        <section v-else-if="selectedKind === 'llm'" class="space-y-5 p-5">
          <div class="block">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
              <select ref="modelCatalogSelect" class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium text-text-primary outline-none" data-config-field="model" :aria-busy="modelStore.loading || modelCatalogRetryPending" :aria-describedby="modelStore.loading || modelStore.error || modelCatalogRetryPending ? 'node-model-catalog-status-message' : undefined" :value="selectedLlmModelId()" @change="handleLlmModelSelection">
                <option value="">{{ t('workflow.inspector.configureModel') }}</option>
                <option v-for="model in availableChatModels" :key="model.id" :value="model.id">{{ modelOptionLabel(model) }}</option>
              </select>
            </label>
            <div v-if="modelStore.loading || modelStore.error || modelCatalogRetryPending" data-testid="node-model-catalog-status" :aria-busy="modelStore.loading || modelCatalogRetryPending" class="mt-2 space-y-2">
              <p v-if="modelStore.loading || modelCatalogRetryPending" id="node-model-catalog-status-message" role="status" aria-live="polite" class="text-xs leading-5 text-text-secondary">{{ t('workflow.inspector.modelCatalogLoading') }}</p>
              <p v-else id="node-model-catalog-status-message" role="alert" class="text-xs leading-5 text-status-error">{{ modelStore.error }}</p>
              <button v-if="modelStore.error || modelCatalogRetryPending" type="button" data-action="retry-model-catalog" :aria-disabled="modelStore.loading || modelCatalogRetryPending" class="rounded-lg border border-app-border px-3 py-2 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="retryModelCatalog">{{ t('workflow.inspector.modelCatalogRetry') }}</button>
            </div>
          </div>
          <UpstreamVariableSelector :key="`${selectedNode.id}-promptVariable`" :node-id="selectedNode.id" field="promptVariable" :label="t('workflow.inspector.inputVariable')" :model-value="textConfig('promptVariable', 'question')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="STRING" :fixed-value-active="Boolean(textConfig('prompt', ''))" @update:model-value="updateConfig('promptVariable', $event)" />
          <UpstreamVariableSelector :key="`${selectedNode.id}-contextVariable`" :node-id="selectedNode.id" field="contextVariable" :label="t('workflow.inspector.contextVariable')" :model-value="textConfig('contextVariable', '')" :nodes="workflowStore.nodes" :edges="workflowStore.edges" :templates="workflowStore.templates" expected-type="STRING" :fixed-value-active="Boolean(textConfig('context', ''))" @update:model-value="updateConfig('contextVariable', $event)" />
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.contextText') }}</span>
            <textarea class="min-h-24 w-full resize-y rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.contextTextPlaceholder')" data-config-field="context" :value="textConfig('context', '')" @input="handleTextInput('context', $event)" />
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.reasoningTags') }}
            <input type="checkbox" class="h-5 w-9 rounded-full accent-primary" :checked="boolConfig('reasoningTags', false)" @change="handleToggle('reasoningTags', $event)" />
          </label>
          <div class="border-t border-app-border pt-4">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
              <label class="inline-flex items-center gap-2 text-xs text-text-secondary">
                {{ t('workflow.inspector.structuredOutput') }}
                <input type="checkbox" class="accent-primary" :checked="boolConfig('structuredOutput', false)" @change="handleToggle('structuredOutput', $event)" />
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'knowledge-retrieval'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.queryText') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="queryText" :value="textConfig('queryText', '')" @input="handleTextInput('queryText', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.queryVariable') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="queryVariable" :value="textConfig('queryVariable', 'question')" @input="handleTextInput('queryVariable', $event)" />
          </label>
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.knowledgeBase') }} <span class="text-status-error">*</span></span>
              <div class="flex items-center gap-3">
                <button type="button" class="inline-flex items-center gap-1 text-sm font-medium text-primary" @click="openKnowledgePage">
                  <Plus class="h-4 w-4" />
                  {{ t('knowledge.flow.createKnowledge') }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-text-muted hover:bg-app-bg2 hover:text-primary"
                  :aria-expanded="retrievalSettingsExpanded"
                  @click="retrievalSettingsExpanded = !retrievalSettingsExpanded"
                >
                  <SlidersHorizontal class="h-4 w-4" />
                  {{ t('workflow.inspector.retrievalSettings') }}
                  <ChevronDown class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': retrievalSettingsExpanded }" />
                </button>
              </div>
            </div>
            <select
              v-if="knowledgeDatasets.length > 0"
              class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm font-medium text-text-primary outline-none focus:border-primary"
              :value="textConfig('datasetId', '')"
              @change="handleTextInput('datasetId', $event)"
            >
              <option value="">{{ t('workflow.inspector.clickAddKnowledge') }}</option>
              <option v-for="dataset in knowledgeDatasets" :key="dataset.id" :value="dataset.id">
                {{ knowledgeDatasetLabel(dataset) }}
              </option>
            </select>
            <button v-else type="button" class="w-full rounded-lg border border-dashed border-app-border bg-app-bg2 px-3 py-5 text-sm font-medium text-text-muted hover:border-primary/50 hover:text-primary" @click="openKnowledgePage">
              {{ t('workflow.inspector.clickAddKnowledge') }}
            </button>
            <p v-if="selectedKnowledgeDataset" class="mt-2 text-xs leading-5 text-text-secondary">
              {{ selectedKnowledgeDataset.description || selectedKnowledgeDataset.retrievalMode }}
            </p>
          </div>
          <div v-if="retrievalSettingsExpanded" class="space-y-4 rounded-lg border border-app-border bg-app-bg2 p-4">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">Top K</span>
              <div class="flex items-center gap-3">
                <input type="range" min="1" max="50" class="min-w-0 flex-1 accent-primary" data-config-field="topK" :value="numberConfig('topK', 3)" @input="handleNumberInput('topK', $event)" />
                <input type="number" min="1" max="50" class="w-20 rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" data-config-field="topK" :value="numberConfig('topK', 3)" @input="handleNumberInput('topK', $event)" />
              </div>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</span>
              <input class="w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" data-config-field="outputVariable" :value="textConfig('outputVariable', 'retrievalContext')" @input="handleTextInput('outputVariable', $event)" />
            </label>
            <label class="flex items-center justify-between text-sm font-semibold text-text-primary">
              <span>{{ t('workflow.inspector.metadataFilter') }}</span>
              <span class="text-xs font-normal text-text-muted">JSON</span>
            </label>
            <textarea
              class="min-h-20 w-full rounded-lg border border-app-border bg-white px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              :placeholder="t('workflow.inspector.metadataFilterPlaceholder')"
              data-config-field="metadataFilter" :value="textConfig('metadataFilter', '')"
              @input="handleMetadataFilterInput"
            />
            <p v-if="metadataFilterError" class="text-xs leading-5 text-status-error" role="alert">{{ metadataFilterError }}</p>
            <p class="text-xs leading-5 text-text-muted">{{ t('workflow.inspector.metadataFilterHint') }}</p>
          </div>
        </section>

        <section v-else-if="selectedKind === 'output'" class="space-y-5 p-5">
          <div class="rounded-lg border border-primary/20 bg-primary-soft/40 p-3 text-sm leading-6 text-text-secondary">
            {{ t('workflow.inspector.outputNodeHint') }}
          </div>
          <div>
            <div class="mb-3 flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.responsePayload') }}</p>
                <p class="mt-1 text-xs text-text-muted">{{ t('workflow.inspector.responsePayloadHint') }}</p>
              </div>
            </div>
            <div class="space-y-2">
              <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" data-config-field="outputName" :value="textConfig('outputName', 'answer')" :aria-label="t('workflow.inspector.responseFieldName')" @input="handleTextInput('outputName', $event)" />
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" data-config-field="outputValue" :value="textConfig('outputValue', '')" @input="handleTextInput('outputValue', $event)" />
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'agent'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.agentStrategy') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="strategy" :value="textConfig('strategy', 'plan')" @change="handleTextInput('strategy', $event)">
              <option value="plan">{{ t('workflow.inspector.planOnly') }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="model" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.taskVariable') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="taskVariable" :value="textConfig('taskVariable', 'question')" @input="handleTextInput('taskVariable', $event)" />
          </label>
          <div class="rounded-xl bg-app-bg2 p-5">
            <Brain class="h-10 w-10 rounded-lg bg-white p-2 text-primary shadow-sm" />
            <p class="mt-4 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.agentStrategyHintTitle') }}</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.agentStrategyHint') }}</p>
          </div>
          <div>
            <p class="mb-3 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <div class="space-y-4">
              <label v-for="variable in agentOutputVariables" :key="variable.name" class="block">
                <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t(variable.descriptionKey) }}</span>
                <span class="flex w-full items-center justify-between rounded-lg border border-app-border bg-white px-3 py-3 text-sm">
                  <span class="font-medium text-text-primary">{{ variable.name }}</span>
                  <span class="text-xs font-medium text-text-muted">{{ variable.type }}</span>
                </span>
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'question-understand'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="inputVariable" :value="textConfig('inputVariable', 'question')" @input="handleTextInput('inputVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="model" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3 text-sm leading-6 text-text-secondary">
            {{ t('workflow.inspector.questionUnderstandHint') }}
          </div>
          <div>
            <p class="mb-3 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between rounded-lg border border-app-border bg-white px-3 py-2"><span class="font-medium">intent</span><span class="text-xs text-text-muted">Object</span></div>
              <div class="flex items-center justify-between rounded-lg border border-app-border bg-white px-3 py-2"><span class="font-medium">intentJson</span><span class="text-xs text-text-muted">Object</span></div>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'question-classifier'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" data-config-field="model" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="inputVariable" :value="textConfig('inputVariable', 'text')" @input="handleTextInput('inputVariable', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-white shadow-sm">
            <div class="border-b border-app-border p-3">
              <label class="flex items-center gap-2 rounded-md border border-app-border px-3 py-2">
                <Search class="h-4 w-4 text-text-muted" />
                <input v-model="classifierVariableSearch" class="min-w-0 flex-1 text-sm outline-none" :placeholder="t('workflow.inspector.searchVariable')" :aria-label="t('workflow.inspector.searchVariable')" />
              </label>
            </div>
            <div class="p-3">
              <p class="mb-2 text-xs font-semibold uppercase text-text-muted">{{ t('workflow.inspector.system') }}</p>
              <button v-for="variable in visibleSystemVariables" :key="variable" type="button" class="flex w-full justify-between rounded bg-app-bg2 px-2 py-1.5 text-left text-sm transition hover:bg-primary-soft" @click="selectClassifierVariable(variable)">
                <span class="font-mono font-semibold">{{ variable }}</span>
                <span class="text-text-muted">String</span>
              </button>
            </div>
          </div>
          <div class="space-y-3">
            <textarea class="min-h-24 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.classPlaceholder', { name: 'CLASS 1' })" data-config-field="class1" :value="textConfig('class1', 'CLASS 1')" @input="handleTextInput('class1', $event)" />
            <textarea class="min-h-24 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.classPlaceholder', { name: 'CLASS 2' })" data-config-field="class2" :value="textConfig('class2', 'CLASS 2')" @input="handleTextInput('class2', $event)" />
          </div>
        </section>

        <section v-else-if="selectedKind === 'condition'" class="space-y-5 p-5">
          <div class="rounded-xl border border-primary/20 bg-primary-soft/60 p-4">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.conditionHint') }}</p>
          </div>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="variable" :value="textConfig('variable', '')" @input="handleTextInput('variable', $event)" />
          </label>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionOperator') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="operator" :value="textConfig('operator', 'EXISTS')" @change="handleTextInput('operator', $event)">
              <option v-for="operator in conditionOperators" :key="operator.value" :value="operator.value">
                {{ t(operator.labelKey) }}
              </option>
            </select>
          </label>

          <label v-if="conditionNeedsValue" class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionValue') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="value" :value="textConfig('value', '')" @input="handleTextInput('value', $event)" />
          </label>

          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionTrueBranch') }}</span>
              <input class="w-full rounded-lg border border-app-border bg-app-bg2 px-3 py-3 font-mono text-sm outline-none focus:border-primary" data-config-field="trueBranch" :value="textConfig('trueBranch', 'true')" @input="handleTextInput('trueBranch', $event)" />
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.conditionFalseBranch') }}</span>
              <input class="w-full rounded-lg border border-app-border bg-app-bg2 px-3 py-3 font-mono text-sm outline-none focus:border-primary" data-config-field="falseBranch" :value="textConfig('falseBranch', 'false')" @input="handleTextInput('falseBranch', $event)" />
            </label>
          </div>
        </section>

        <section v-else-if="selectedKind === 'human'" class="space-y-5 p-5">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.submissionMethod') }}</p>
                <p class="mt-1 text-xs leading-5 text-text-muted">{{ t('workflow.inspector.submissionMethodHint') }}</p>
              </div>
            </div>
            <div class="rounded-xl border border-app-border bg-white shadow-sm">
              <button
                type="button"
                class="flex w-full items-center gap-3 border-b border-app-border p-4 text-left transition hover:bg-primary-soft/30"
                :class="isHumanMethodSelected('webapp') ? 'bg-primary-soft/30' : ''"
                @click="toggleHumanMethod('webapp')"
              >
                <span class="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white"><MessageSquare class="h-4 w-4" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.webappMethod') }}</span>
                  <span class="text-xs leading-5 text-text-secondary">{{ t('workflow.inspector.webappHint') }}</span>
                </span>
                <span v-if="isHumanMethodSelected('webapp')" class="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white">{{ t('status.active') }}</span>
              </button>
              <button
                type="button"
                class="flex w-full items-center gap-3 border-b border-app-border p-4 text-left transition hover:bg-primary-soft/30"
                :class="isHumanMethodSelected('telegram') ? 'bg-primary-soft/30' : ''"
                @click="toggleHumanMethod('telegram')"
              >
                <span class="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white"><Send class="h-4 w-4" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-text-primary">Telegram</span>
                  <span class="text-xs leading-5 text-text-secondary">{{ t('workflow.inspector.telegramHint') }}</span>
                </span>
                <span v-if="isHumanMethodSelected('telegram')" class="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white">{{ t('status.active') }}</span>
              </button>
            </div>
          </div>
          <div>
            <p class="mb-2 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <div class="space-y-4">
              <label v-for="variable in humanOutputVariables" :key="variable.name" class="block">
                <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t(variable.descriptionKey) }}</span>
                <span class="flex w-full items-center justify-between rounded-lg border border-app-border bg-white px-3 py-3 text-sm">
                  <span class="font-medium text-text-primary">{{ variable.name }}</span>
                  <span class="text-xs font-medium text-text-muted">{{ variable.type }}</span>
                </span>
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'iteration' || selectedKind === 'loop'" class="space-y-5 p-5">
          <div class="rounded-xl border border-primary/20 bg-primary-soft/60 p-4">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.iterationSemanticsTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">
              {{ selectedKind === 'iteration' ? '逐项执行下方步骤，支持异步等待与恢复；已完成项不会重复执行。' : '逐轮执行下方步骤并回填状态，遇到停止标记或次数上限结束。' }}
            </p>
          </div>
          <label class="block">
              <span class="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">{{ t('workflow.inspector.input') }} <span class="rounded-md border border-app-border px-2 py-1 text-xs text-text-muted">{{ selectedKind === 'iteration' ? 'Array' : 'Object' }}</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="inputVariable" :value="textConfig('inputVariable', textConfig('input', selectedKind === 'iteration' ? 'items' : 'state'))" @input="handleTextInput('inputVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">{{ t('workflow.inspector.output') }} <span class="rounded-md border border-app-border px-2 py-1 text-xs text-text-muted">{{ selectedKind === 'iteration' ? 'Array' : 'Object' }}</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="outputVariable" :value="textConfig('outputVariable', textConfig('output', selectedKind === 'iteration' ? 'iterationItems' : 'loopState'))" @input="handleTextInput('outputVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.maxIterations') }}</span>
            <input type="number" min="0" class="w-full rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm" data-config-field="maxIterations" :value="numberConfig('maxIterations', selectedKind === 'iteration' ? 12 : 10)" @input="handleNumberInput('maxIterations', $event)" />
          </label>
          <label v-if="selectedKind === 'loop'" class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.stopWhen') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.stopWhenPlaceholder')" data-config-field="stopWhen" :value="textConfig('stopWhen', 'done')" @input="handleTextInput('stopWhen', $event)" />
          </label>
          <label v-if="selectedKind === 'iteration'" class="block text-sm">每项变量名称
            <input aria-label="每项变量名称" class="mt-2 w-full rounded border p-2" data-config-field="itemVariable" :value="textConfig('itemVariable', 'item')" @input="handleTextInput('itemVariable', $event)" />
          </label>
          <label class="block text-sm">索引变量名称
            <input aria-label="索引变量名称" class="mt-2 w-full rounded border p-2" data-config-field="indexVariable" :value="textConfig('indexVariable', selectedKind === 'iteration' ? 'iterationIndex' : 'loopIteration')" @input="handleTextInput('indexVariable', $event)" />
          </label>
          <label v-if="selectedKind === 'iteration'" class="block text-sm">同时等待的任务上限（1–8）
            <input aria-label="批次并发上限" type="number" min="1" max="8" class="mt-2 w-full rounded border p-2" data-config-field="concurrency" :value="numberConfig('concurrency', 1)" @input="handleNumberInput('concurrency', $event)" />
          </label>
          <label v-if="selectedKind === 'iteration'" class="block text-sm">某项失败时
            <select aria-label="批次失败策略" class="mt-2 w-full rounded border p-2" data-config-field="failureStrategy" :value="textConfig('failureStrategy', 'STOP')" @change="handleTextInput('failureStrategy', $event)"><option value="STOP">停止批次</option><option value="CONTINUE">保留失败项并继续</option></select>
          </label>
          <LoopBodyEditor :key="selectedNode?.id" :model-value="configValue('bodyNodes', [])" :catalog="nodeCatalog" @update:model-value="updateConfig('bodyNodes', $event)" />
        </section>

        <section v-else-if="selectedKind === 'code'" class="space-y-5 p-5">
          <div class="rounded-xl border border-status-warning/30 bg-amber-50 p-4">
            <p class="text-sm font-semibold text-status-warning">{{ t('workflow.inspector.codeExecutionUnavailableTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.codeExecutionUnavailableHint') }}</p>
          </div>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.codeLanguage') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="language" :value="textConfig('language', 'python3')" @change="handleTextInput('language', $event)">
              <option value="python3">Python 3</option>
            </select>
          </label>

          <div class="overflow-hidden rounded-xl bg-app-bg2">
            <div class="flex items-center justify-between border-b border-app-border px-3 py-2 text-sm font-semibold text-text-primary">
              <span>{{ t('workflow.inspector.code') }}</span>
              <span class="text-xs font-medium text-text-muted">{{ textConfig('language', 'python3') }}</span>
            </div>
            <textarea class="h-48 w-full resize-none bg-app-bg2 p-3 font-mono text-sm outline-none" :placeholder="defaultPythonCode" data-config-field="code" :value="textConfig('code', '')" @input="handleTextInput('code', $event)" />
          </div>

          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariableName') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 font-mono text-sm outline-none focus:border-primary" data-config-field="outputVariable" :value="textConfig('outputVariable', 'codeResult')" @input="handleTextInput('outputVariable', $event)" />
          </label>
        </section>

        <section v-else-if="selectedKind === 'template-transform'" class="space-y-5 p-5">
          <label class="block text-sm font-semibold">转换模式
            <select class="mt-2 w-full rounded-lg border border-app-border bg-app-bg px-3 py-3 text-sm" data-config-field="transformMode" :value="textConfig('transformMode', 'text')" @change="changeTransformMode">
              <option value="text">文本模板</option><option value="structured">结构化数据映射</option>
            </select>
          </label>
          <StructuredMappingEditor data-config-field="mapping" tabindex="-1" v-if="textConfig('transformMode', 'text') === 'structured' && selectedNode" :key="selectedNode.id" :node-id="selectedNode.id" :config="selectedNode.data.config ?? {}" @apply="applyStructuredMapping" />
          <template v-else>
          <div class="rounded-xl border border-primary/20 bg-primary-soft/60 p-4">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.templateVariablesTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.templateVariablesHint') }}</p>
          </div>
          <div class="overflow-hidden rounded-xl bg-app-bg2">
            <div class="flex items-center justify-between border-b border-app-border px-3 py-2 text-sm font-semibold text-text-primary">
              <span>{{ t('workflow.inspector.code') }}</span>
              <span class="text-xs text-text-muted">{{ t('workflow.inspector.templateSyntax') }}</span>
            </div>
            <textarea class="h-56 w-full resize-none bg-app-bg2 p-3 font-mono text-sm outline-none" :placeholder="defaultJinjaTemplate" data-config-field="template" :value="textConfig('template', '')" @input="handleTextInput('template', $event)" />
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariableName') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 font-mono text-sm outline-none focus:border-primary" data-config-field="outputVariable" :value="textConfig('outputVariable', 'renderedText')" @input="handleTextInput('outputVariable', $event)" />
          </label>
          </template>
        </section>

        <section v-else-if="selectedKind === 'document-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.fileIdVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="fileIdVariable" :value="textConfig('fileIdVariable', 'fileId')" @input="handleTextInput('fileIdVariable', $event)" />
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.fileTypes', { types: fileTypes.join(', ') }) }}</p>
          </label>
          <div>
            <p class="mb-3 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <div class="space-y-4">
              <label v-for="variable in documentExtractorOutputVariables" :key="variable.name" class="block">
                <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t(variable.descriptionKey) }}</span>
                <span class="flex w-full items-center justify-between rounded-lg border border-app-border bg-white px-3 py-3 text-sm">
                  <span class="font-medium text-text-primary">{{ variable.name }}</span>
                  <span class="text-xs font-medium text-text-muted">{{ variable.type }}</span>
                </span>
              </label>
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'variable-assigner'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.assignedVariable') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="variable" :value="textConfig('variable', 'conversation.summary')" @input="handleTextInput('variable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.valueMode') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="valueMode" :value="variableAssignerMode()" @change="handleVariableAssignerModeChange">
              <option value="LITERAL">{{ t('workflow.inspector.fixedValue') }}</option>
              <option value="SOURCE_VARIABLE">{{ t('workflow.inspector.sourceVariableMode') }}</option>
            </select>
          </label>
          <template v-if="variableAssignerMode() === 'SOURCE_VARIABLE'">
            <UpstreamVariableSelector
              :key="`${selectedNode.id}-sourceVariable`"
              :node-id="selectedNode.id"
              field="sourceVariable"
              :label="t('workflow.inspector.sourceVariable')"
              :model-value="textConfig('sourceVariable', '')"
              :nodes="workflowStore.nodes"
              :edges="workflowStore.edges"
              :templates="workflowStore.templates"
              @update:model-value="updateConfig('sourceVariable', $event)"
            />
          </template>
          <template v-else>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.valueType') }}</span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" data-config-field="valueType" :value="variableAssignerValueType()" @change="handleVariableAssignerValueTypeChange">
                <option value="STRING">{{ t('workflow.inspector.stringLiteral') }}</option>
                <option value="JSON">{{ t('workflow.inspector.jsonValue') }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.assignedValue') }}</span>
              <textarea
                v-if="variableAssignerValueType() === 'JSON'"
                class="min-h-28 w-full resize-y rounded-lg border border-app-border bg-app-muted px-3 py-3 font-mono text-sm outline-none focus:border-primary"
                data-config-field="value"
                :value="variableAssignerJsonText()"
                @input="handleVariableAssignerJsonInput"
              />
              <textarea
                v-else
                class="min-h-28 w-full resize-y rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary"
                data-config-field="value"
                :placeholder="t('workflow.inspector.setVariable')"
                :value="String(variableAssignerValue() ?? '')"
                @input="handleVariableAssignerStringInput"
              />
            </label>
          </template>
          <!-- 未解析文本随 config 一起保存，切到来源变量后仍要提示，否则保存会被静默驳回。 -->
          <p v-if="valueValidationError" role="alert" class="text-sm text-status-error">{{ valueValidationError }}</p>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
        </section>

        <section v-else-if="selectedKind === 'variable-aggregate'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariables') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.inputVariablesPlaceholder')" data-config-field="variables" :value="textConfig('variables', 'left,right')" @input="handleTextInput('variables', $event)" />
            <p class="mt-2 text-xs leading-5 text-text-muted">{{ t('workflow.inspector.inputVariablesHint') }}</p>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariableName') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 font-mono text-sm outline-none focus:border-primary" data-config-field="outputVariable" :value="textConfig('outputVariable', 'merged')" @input="handleTextInput('outputVariable', $event)" />
          </label>
          <p class="text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.variableAggregateHint') }}</p>
        </section>

        <section v-else-if="selectedKind === 'parameter-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" data-config-field="model" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" data-config-field="inputVariable" :value="textConfig('inputVariable', 'text')" @input="handleTextInput('inputVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.instruction') }}</span>
            <textarea class="min-h-32 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.instructionPlaceholder')" data-config-field="instruction" :value="textConfig('instruction', '')" @input="handleTextInput('instruction', $event)" />
          </label>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.advancedSettings') }} <ChevronDown class="inline h-4 w-4" /></p>
        </section>

        <SubworkflowConfigPanel v-else-if="selectedKind === 'subworkflow'" :key="selectedNode.id" :config="selectedNode.data.config" @update="updateConfig" @patch="workflowStore.updateNodeConfigValues(selectedNode.id, $event)" />

        <section v-else-if="hasDynamicConfigPanel" class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ nodeLabel(selectedNode.data.kind) }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ nodeDescription(selectedNode.data.kind) }}</p>
          </div>

          <div v-if="hasAdvancedConfigFields" class="grid grid-cols-2 rounded-lg border border-app-border bg-app-muted p-1">
            <button
              type="button"
              class="rounded-md px-3 py-2 text-sm font-semibold transition"
              :class="dynamicMode === 'basic' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'"
              @click="dynamicMode = 'basic'"
            >
              {{ t('workflow.inspector.basicMode') }}
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-2 text-sm font-semibold transition"
              :class="dynamicMode === 'advanced' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'"
              @click="dynamicMode = 'advanced'"
            >
              {{ t('workflow.inspector.advancedMode') }}
            </button>
          </div>

          <label v-for="field in visibleDynamicConfigFields" :key="field.name" class="block">
            <span class="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-text-primary">
              <span class="min-w-0 truncate">{{ dynamicFieldLabel(field) }} <span v-if="field.required && !(selectedKind === 'prompt' && field.name === 'prompt' && isComfyPromptSummary(selectedNode.data.config))" class="text-status-error">*</span></span>
              <span class="shrink-0 rounded-md border border-app-border px-2 py-1 text-[11px] font-medium uppercase text-text-muted">{{ field.type }}</span>
            </span>

            <select
              v-if="isSelectField(field)"
              :data-config-field="field.name"
              class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
              :value="fieldSelectValue(field)"
              @change="handleDynamicFieldInput(field, $event)"
            >
              <option v-for="option in selectOptions(field)" :key="option" :value="option">{{ option }}</option>
            </select>

            <div
              v-else-if="isSegmentedField(field)"
              class="grid rounded-lg border border-app-border bg-app-muted p-1"
              :style="{ gridTemplateColumns: `repeat(${selectOptions(field).length}, minmax(0, 1fr))` }"
            >
              <button
                v-for="option in selectOptions(field)"
                :key="option"
                :data-config-field="field.name"
                type="button"
                class="rounded-md px-3 py-2 text-sm font-semibold transition"
                :class="fieldSelectValue(field) === option ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'"
                @click="updateConfig(field.name, option)"
              >
                {{ option }}
              </button>
            </div>

            <input
              v-else-if="isNumberField(field)"
              :data-config-field="field.name"
              type="number"
              class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
              :min="field.ui?.min"
              :max="field.ui?.max"
              :step="field.ui?.step ?? 'any'"
              :value="String(fieldCurrentValue(field) ?? '')"
              @input="handleDynamicFieldInput(field, $event)"
            />

            <label v-else-if="isBooleanField(field)" class="flex items-center justify-between rounded-lg border border-app-border bg-white px-3 py-3 text-sm font-medium text-text-primary">
              <span>{{ String(fieldCurrentValue(field) ?? false) }}</span>
              <input type="checkbox" :data-config-field="field.name" class="accent-primary" :checked="boolConfig(field.name, Boolean(fieldDefaultValue(field)))" @change="handleDynamicFieldToggle(field, $event)" />
            </label>

            <textarea
              v-else-if="isTextareaField(field)"
              :data-config-field="field.name"
              class="min-h-28 w-full resize-y rounded-lg border border-app-border bg-white px-3 py-3 font-mono text-sm outline-none focus:border-primary"
              :value="fieldStringValue(field)"
              @input="handleDynamicFieldInput(field, $event)"
            />

            <input
              v-else
              :data-config-field="field.name"
              class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary"
              :value="fieldStringValue(field)"
              @input="handleDynamicFieldInput(field, $event)"
            />

            <p v-if="dynamicFieldDescription(field)" class="mt-2 text-xs leading-5 text-text-muted">{{ dynamicFieldDescription(field) }}</p>
          </label>
        </section>

        <section v-else class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ nodeDescription(selectedNode.data.kind) }}</p>
          </div>
          <label v-for="[key, value] in selectedConfigEntries()" :key="key" class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">{{ key }}</span>
            <textarea
              v-if="isStructuredConfigValue(value)"
              class="min-h-28 w-full resize-y rounded-md border border-app-border bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-primary"
              :value="structuredConfigText(key, value)"
              spellcheck="false"
              @input="handleStructuredConfigInput(key, $event)"
            />
            <input
              v-else
              class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
              :value="String(value)"
              @input="handleTextInput(key, $event)"
            />
            <p v-if="structuredConfigErrors[key]" class="mt-1 text-xs text-status-error" role="alert">{{ structuredConfigErrors[key] }}</p>
          </label>
        </section>

        <section class="border-t border-app-border p-5">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.latestRuntime') }}</p>
            <StatusBadge :status="selectedNode.data.status" />
          </div>
          <p class="mt-2 text-sm text-text-secondary">{{ runtimeText }}</p>
          <p class="mt-1 text-xs text-text-muted">{{ t('workflow.duration') }}: {{ runtimeDurationMs }}ms</p>
        </section>
      </div>

      <div v-else class="min-h-0 flex-1 overflow-y-auto p-5">
        <section class="rounded-xl border border-app-border bg-white p-4 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.lastRun') }}</p>
              <p class="mt-1 text-xs text-text-muted">{{ t('workflow.inspector.lastRunHint') }}</p>
            </div>
            <StatusBadge :status="selectedNode.data.status" />
          </div>

          <div class="mt-4 grid gap-3 text-sm">
            <div class="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-lg bg-app-bg2 px-3 py-2">
              <span class="text-text-muted">{{ t('workflow.inspector.runStatus') }}</span>
              <span class="font-medium text-text-primary">{{ selectedNode.data.status }}</span>
            </div>
            <div class="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-lg bg-app-bg2 px-3 py-2">
              <span class="text-text-muted">{{ t('workflow.duration') }}</span>
              <span class="font-medium text-text-primary">{{ runtimeDurationMs }}ms</span>
            </div>
            <div class="rounded-lg bg-app-bg2 px-3 py-2">
              <p class="text-text-muted">{{ t('workflow.inspector.runResult') }}</p>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">{{ runtimeText || t('workflow.inspector.noRunResult') }}</p>
              <LoopRunResults v-if="selectedKind === 'iteration' || selectedKind === 'loop'" :instance-id="currentWorkflowRun?.backendInstanceId ?? currentWorkflowRun?.runtimeWorkflowId" :node-id="selectedNode.id" :run-status="currentWorkflowRun?.backendStatus" />
            </div>
          </div>
        </section>

        <section class="mt-4 rounded-xl border border-dashed border-app-border bg-app-bg2 p-4 text-sm leading-6 text-text-secondary">
          {{ t('workflow.inspector.lastRunDetailHint') }}
        </section>
      </div>
    </div>

    <div v-else class="flex h-full flex-col">
      <div class="flex h-16 items-center justify-between gap-3 border-b border-app-border px-4">
        <div class="flex min-w-0 items-center gap-2">
          <SlidersHorizontal class="h-4 w-4 shrink-0 text-primary" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.nodeInspector') }}</p>
            <p class="truncate text-xs text-text-muted">{{ t('workflow.inputsOutputsRuntime') }}</p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md border border-app-border text-text-secondary transition hover:border-ai/30 hover:bg-ai-soft hover:text-ai"
            :title="t('workflow.openCopilot')"
            :aria-label="t('workflow.openCopilot')"
            @click="emit('openCopilot')"
          >
            <Sparkles class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md border border-app-border text-text-secondary transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
            :title="t('workflow.openLogs')"
            :aria-label="t('workflow.openLogs')"
            @click="emit('openLogs')"
          >
            <TerminalSquare class="h-4 w-4" />
          </button>
        </div>
      </div>
      <div class="p-4 text-sm text-text-secondary">{{ t('workflow.noNodeSelected') }}</div>
    </div>
  </aside>
</template>
