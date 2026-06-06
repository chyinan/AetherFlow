<script setup lang="ts">
import {
  BookOpen,
  Brain,
  Braces,
  ChevronDown,
  Code2,
  Copy,
  Database,
  FileText,
  Film,
  GitBranch,
  Hand,
  Languages,
  MessageSquare,
  Mic,
  Plus,
  Play,
  Repeat2,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Split,
  TerminalSquare,
  Trash2,
  Upload,
  Variable,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  getNodeCatalog,
  type WorkflowNodeCatalogItem,
  type WorkflowNodeConfigSchema,
} from '@/api/modules/node'
import { useDifyStore } from '@/stores/difyStore'
import { useFileStore } from '@/stores/fileStore'
import { useModelStore } from '@/stores/modelStore'
import { useRunStore } from '@/stores/runStore'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { FileAsset } from '@/types/file'
import type { WorkflowNodeKind } from '@/types/workflow'

type ConfigValue = unknown
type ConfigRecord = Record<string, ConfigValue>

const uiStore = useUiStore()
const workflowStore = useWorkflowStore()
const difyStore = useDifyStore()
const fileStore = useFileStore()
const modelStore = useModelStore()
const runStore = useRunStore()
const selectedNode = computed(() => {
  const selectedByFlow = workflowStore.nodes.find((node) => node.selected)
  const selectedByStore = workflowStore.nodes.find((node) => node.id === uiStore.selectedNodeId)
  return selectedByFlow ?? selectedByStore ?? null
})
const { t, te } = useI18n()
const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const activeTab = ref<'settings' | 'lastRun'>('settings')
const dynamicMode = ref<'basic' | 'advanced'>('basic')
const retrievalSettingsExpanded = ref(false)
const nodeCatalog = ref<WorkflowNodeCatalogItem[]>([])
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
  whisper: Mic,
  llm: Brain,
  ffmpeg: Film,
  translate: Languages,
  summary: MessageSquare,
  'knowledge-retrieval': BookOpen,
  export: FileText,
  output: MessageSquare,
  agent: Brain,
  'question-understand': MessageSquare,
  'question-classifier': Split,
  condition: GitBranch,
  human: Hand,
  iteration: Repeat2,
  loop: RotateCcw,
  code: Code2,
  'template-transform': FileText,
  'variable-aggregate': Database,
  'document-extractor': FileText,
  'variable-assigner': Variable,
  'parameter-extractor': Braces,
}

const nodeIcon = computed(() => (selectedNode.value ? iconMap[selectedNode.value.data.kind] : SlidersHorizontal))
const selectedKind = computed(() => selectedNode.value?.data.kind ?? '')
const imageSchemaKinds = new Set<WorkflowNodeKind>(['prompt', 'image-generation', 'upscale', 'save-image'])
const backendTypeByKind: Partial<Record<WorkflowNodeKind, string>> = {
  prompt: 'PROMPT',
  'image-generation': 'IMAGE_GENERATION',
  upscale: 'UPSCALE',
  'save-image': 'SAVE_IMAGE',
}
const selectedRunNode = computed(() =>
  runStore.currentRun?.nodeStates.find((node) => node.nodeId === selectedNode.value?.id),
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
const canRunNode = computed(() => Boolean(selectedNode.value))
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
const dynamicConfigFields = computed(() => selectedCatalogItem.value?.configSchema ?? [])
const visibleDynamicConfigFields = computed(() =>
  dynamicConfigFields.value.filter((field) => fieldMode(field) === dynamicMode.value),
)
const hasAdvancedConfigFields = computed(() =>
  dynamicConfigFields.value.some((field) => fieldMode(field) === 'advanced'),
)

const sysVariables = ['sys.user_id', 'sys.app_id', 'sys.workflow_id', 'sys.workflow_run_id']
const fileTypes = ['msg', 'pdf', 'xls', 'pptx', 'eml', 'htm', 'docx', 'epub', 'xlsx', 'doc', 'markdown', 'vtt', 'mdx', 'html', 'xml', 'md', 'csv', 'txt', 'properties', 'ppt']
const defaultPythonCode = 'def main(arg1: str, arg2: str):\n    return {\n        "result": arg1 + arg2,\n    }'
const defaultJinjaTemplate = '{{ arg1 }}'
const summaryLanguages = ['Chinese', 'English']
const summaryProviders = ['ollama', 'openai']
const exportFormats = ['MARKDOWN', 'TXT', 'JSON']
const agentOutputVariables = [
  { name: 'text', type: 'String', descriptionKey: 'workflow.inspector.generatedContent' },
  { name: 'usage', type: 'object', descriptionKey: 'workflow.inspector.modelUsage' },
  { name: 'files', type: 'Array[File]', descriptionKey: 'workflow.inspector.generatedFiles' },
  { name: 'json', type: 'Array[Object]', descriptionKey: 'workflow.inspector.generatedJson' },
]
const humanOutputVariables = [
  { name: '__action_id', type: 'string', descriptionKey: 'workflow.inspector.actionId' },
]
const humanTimeoutUnits = [
  { value: 'minutes', labelKey: 'workflow.inspector.minutes' },
  { value: 'hours', labelKey: 'workflow.inspector.hours' },
  { value: 'days', labelKey: 'workflow.inspector.days' },
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

const knowledgeDatasets = computed(() => difyStore.datasets.filter((dataset) => dataset.status !== 'disabled'))

const selectedKnowledgeDataset = computed(() => {
  const datasetId = textConfig('dataset', '')
  return knowledgeDatasets.value.find((dataset) => dataset.id === datasetId)
})

const availableChatModels = computed(() =>
  modelStore.models.filter((model) => model.kind === 'chat' && model.status !== 'disabled'),
)

function modelOptionLabel(model: { name: string; providerId: string }) {
  const provider = modelStore.providers.find((item) => item.id === model.providerId)
  return provider ? `${model.name} · ${provider.name}` : model.name
}

function knowledgeDatasetLabel(dataset: { name: string; documentCount: number; chunkCount: number }) {
  return `${dataset.name} · ${dataset.documentCount} docs · ${dataset.chunkCount} chunks`
}

function nodeLabel(kind: string) {
  return t(`workflow.catalog.items.${kind}.label`)
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
  return isConfigRecord(config) ? Object.entries(config) : []
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

function handleNumberInput(key: string, event: Event) {
  updateConfig(key, Number((event.target as HTMLInputElement).value))
}

function handleToggle(key: string, event: Event) {
  updateConfig(key, (event.target as HTMLInputElement).checked)
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

function isTimeoutUnitSelected(unit: string) {
  return textConfig('timeoutUnit', 'days') === unit
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

function selectInputFile(file: FileAsset) {
  if (!file.backendFileId) {
    return
  }
  updateConfig('fileId', file.backendFileId)
  updateConfig('fileName', file.name)
}

async function handleInputFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  try {
    const asset = await fileStore.upload(file)
    if (asset?.backendFileId) {
      selectInputFile(asset)
    }
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
    <div v-if="selectedNode" class="flex min-h-0 flex-1 flex-col">
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
              v-if="canRunNode"
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-app-bg2 hover:text-primary"
              :title="t('workflow.testNode')"
            >
              <Play class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-app-bg2 hover:text-primary"
              :title="t('workflow.openLogs')"
              @click="emit('openLogs')"
            >
              <BookOpen class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="grid h-8 w-8 place-items-center rounded-md hover:bg-ai-soft hover:text-ai"
              :title="t('workflow.openCopilot')"
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

        <input
          class="mx-5 mt-5 w-[calc(100%-2.5rem)] rounded-md border border-transparent px-0 py-1 text-sm text-text-secondary outline-none placeholder:text-text-muted focus:border-app-border focus:px-2"
          :placeholder="t('workflow.inspector.addDescription')"
          :value="textConfig('description', '')"
          @input="handleTextInput('description', $event)"
        />

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

      <div v-if="activeTab === 'settings'" class="min-h-0 flex-1 overflow-y-auto">
        <section v-if="selectedKind === 'start'" class="space-y-5 p-5">
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
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('fileId', '')" @change="handleTextInput('fileId', $event)">
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
        </section>

        <section v-else-if="selectedKind === 'ffmpeg'" class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.videoMetadataTitle') }}</p>
            <p class="mt-1 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.videoMetadataHint') }}</p>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.fileIdVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('fileIdVariable', 'fileId')" @input="handleTextInput('fileIdVariable', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-white p-3 text-sm text-text-secondary">
            <p><span class="font-semibold text-text-primary">fileUrl</span>：{{ t('workflow.inspector.fileUrlOutput') }}</p>
            <p class="mt-1"><span class="font-semibold text-text-primary">fileObjectKey</span>：{{ t('workflow.inspector.objectKeyOutput') }}</p>
          </div>
        </section>

        <section v-else-if="selectedKind === 'whisper'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.fileUrlVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('fileUrlVariable', 'fileUrl')" @input="handleTextInput('fileUrlVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.asrLanguage') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('language', 'auto')" @change="handleTextInput('language', $event)">
              <option value="auto">auto</option>
              <option value="zh">zh</option>
              <option value="en">en</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.asrPrompt') }}</span>
            <textarea class="min-h-28 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('prompt', '')" @input="handleTextInput('prompt', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3 text-sm text-text-secondary">
            {{ t('workflow.inspector.whisperRuntimeHint') }}
          </div>
        </section>

        <section v-else-if="selectedKind === 'summary'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.textVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('textVariable', 'transcription')" @input="handleTextInput('textVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.summaryLanguage') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('language', 'Chinese')" @change="handleTextInput('language', $event)">
              <option v-for="language in summaryLanguages" :key="language" :value="language">{{ language }}</option>
            </select>
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.provider') }} <span class="text-status-error">*</span></span>
              <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('provider', 'ollama')" @change="handleTextInput('provider', $event)">
                <option v-for="provider in summaryProviders" :key="provider" :value="provider">{{ provider }}</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
              <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('model', 'qwen3.5:9b')" @input="handleTextInput('model', $event)" />
            </label>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.summaryPrompt') }}</span>
            <textarea class="min-h-40 w-full resize-none rounded-lg border border-app-border bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-primary" :value="textConfig('prompt', '')" @input="handleTextInput('prompt', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3 text-sm leading-6 text-text-secondary">
            {{ t('workflow.inspector.summaryPromptHint') }}
          </div>
        </section>

        <section v-else-if="selectedKind === 'export'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.exportFormat') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('format', 'MARKDOWN')" @change="handleTextInput('format', $event)">
              <option v-for="format in exportFormats" :key="format" :value="format">{{ format }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.sourceVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('sourceVariable', 'summary')" @input="handleTextInput('sourceVariable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputFileName') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('fileName', 'meeting-summary.md')" @input="handleTextInput('fileName', $event)" />
          </label>
        </section>

        <section v-else-if="selectedKind === 'llm'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium text-text-primary outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.context') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('context', '')" @input="handleTextInput('context', $event)" />
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.vision') }}
            <input type="checkbox" class="h-5 w-9 rounded-full accent-primary" :checked="boolConfig('vision', false)" @change="handleToggle('vision', $event)" />
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
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.retryOnFailure') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('retry', false)" @change="handleToggle('retry', $event)" />
          </label>
          <label class="block border-t border-app-border pt-4">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.exceptionHandling') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm" :value="textConfig('exceptionHandling', 'none')" @change="handleTextInput('exceptionHandling', $event)">
              <option value="none">{{ t('workflow.inspector.none') }}</option>
              <option value="fallback">{{ t('workflow.inspector.fallback') }}</option>
            </select>
          </label>
        </section>

        <section v-else-if="selectedKind === 'knowledge-retrieval'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.queryText') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('query', '')" @input="handleTextInput('query', $event)" />
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
              :value="textConfig('dataset', '')"
              @change="handleTextInput('dataset', $event)"
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
                <input type="range" min="1" max="10" class="min-w-0 flex-1 accent-primary" :value="numberConfig('topK', 3)" @input="handleNumberInput('topK', $event)" />
                <input type="number" min="1" max="10" class="w-20 rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" :value="numberConfig('topK', 3)" @input="handleNumberInput('topK', $event)" />
              </div>
            </label>
            <label class="block">
              <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</span>
              <input class="w-full rounded-lg border border-app-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" :value="textConfig('outputVariable', 'retrievalContext')" @input="handleTextInput('outputVariable', $event)" />
            </label>
            <label class="flex items-center justify-between text-sm font-semibold text-text-primary">
              {{ t('workflow.inspector.metadataFilter') }}
              <select class="rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary" :value="textConfig('metadataFilter', 'disabled')" @change="handleTextInput('metadataFilter', $event)">
                <option value="disabled">{{ t('workflow.inspector.disabled') }}</option>
                <option value="enabled">{{ t('status.active') }}</option>
              </select>
            </label>
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
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :value="textConfig('outputName', 'answer')" :aria-label="t('workflow.inspector.responseFieldName')" @input="handleTextInput('outputName', $event)" />
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('outputValue', '')" @input="handleTextInput('outputValue', $event)" />
              </div>
            </div>
          </div>
          <label class="block border-t border-app-border pt-4">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.responseMode') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm" :value="textConfig('responseMode', 'text')" @change="handleTextInput('responseMode', $event)">
              <option value="text">Text</option>
              <option value="json">JSON</option>
              <option value="stream">Stream</option>
            </select>
          </label>
          <label class="flex items-start justify-between gap-4 border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            <span>
              <span class="block">{{ t('workflow.inspector.showArtifactsInFiles') }}</span>
              <span class="mt-1 block text-xs font-normal leading-5 text-text-muted">{{ t('workflow.inspector.showArtifactsInFilesHint') }}</span>
            </span>
            <input type="checkbox" class="mt-1 accent-primary" :checked="boolConfig('exposeArtifacts', true)" @change="handleToggle('exposeArtifacts', $event)" />
          </label>
          <label class="block border-t border-app-border pt-4">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputDirectoryOptional') }}</span>
            <input class="w-full rounded-lg border border-app-border bg-white px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.outputDirectoryPlaceholder')" :value="textConfig('outputDirectory', '')" @input="handleTextInput('outputDirectory', $event)" />
            <p class="mt-2 text-xs leading-5 text-text-muted">{{ t('workflow.inspector.outputDirectoryHint') }}</p>
          </label>
        </section>

        <section v-else-if="selectedKind === 'agent'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.agentStrategy') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('strategy', '')" @change="handleTextInput('strategy', $event)">
              <option value="">{{ t('workflow.inspector.selectAgentStrategy') }}</option>
              <option value="function-calling">Function Calling</option>
              <option value="react">ReAct</option>
            </select>
          </label>
          <div class="rounded-xl bg-app-bg2 p-5">
            <Brain class="h-10 w-10 rounded-lg bg-white p-2 text-primary shadow-sm" />
            <p class="mt-4 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.agentStrategyHintTitle') }}</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.agentStrategyHint') }} <span class="text-primary">{{ t('workflow.inspector.learnMore') }}</span></p>
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

        <section v-else-if="selectedKind === 'question-classifier'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('input', '')" @input="handleTextInput('input', $event)" />
          </label>
          <div class="rounded-lg border border-app-border bg-white shadow-sm">
            <div class="border-b border-app-border p-3">
              <label class="flex items-center gap-2 rounded-md border border-app-border px-3 py-2">
                <Search class="h-4 w-4 text-text-muted" />
                <input class="min-w-0 flex-1 text-sm outline-none" :placeholder="t('workflow.inspector.searchVariable')" />
              </label>
            </div>
            <div class="p-3">
              <p class="mb-2 text-xs font-semibold uppercase text-text-muted">{{ t('workflow.inspector.system') }}</p>
              <p v-for="variable in sysVariables" :key="variable" class="flex justify-between rounded bg-app-bg2 px-2 py-1.5 text-sm">
                <span class="font-mono font-semibold">{{ variable }}</span>
                <span class="text-text-muted">String</span>
              </p>
            </div>
          </div>
          <div class="space-y-3">
            <textarea class="min-h-24 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.classPlaceholder', { name: 'CLASS 1' })" :value="textConfig('class1', 'CLASS 1')" @input="handleTextInput('class1', $event)" />
            <textarea class="min-h-24 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.classPlaceholder', { name: 'CLASS 2' })" :value="textConfig('class2', 'CLASS 2')" @input="handleTextInput('class2', $event)" />
          </div>
        </section>

        <section v-else-if="selectedKind === 'condition'" class="space-y-5 p-5">
          <div v-for="branch in ['if', 'elif']" :key="branch" class="border-b border-app-border pb-5">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold uppercase text-text-primary">{{ branch === 'if' ? 'IF' : 'ELIF' }}</p>
                <p class="text-xs font-semibold uppercase text-text-muted">{{ branch === 'if' ? 'CASE1' : 'CASE2' }}</p>
              </div>
              <div class="flex items-center gap-2">
                <button class="inline-flex items-center gap-2 rounded-md border border-app-border px-3 py-2 text-sm font-medium text-text-primary">
                  <Plus class="h-4 w-4" />
                  {{ t('workflow.inspector.addCondition') }}
                </button>
                <button class="inline-flex items-center gap-1 text-sm font-medium text-text-secondary">
                  <Trash2 class="h-4 w-4" />
                  {{ t('workflow.inspector.remove') }}
                </button>
              </div>
            </div>
          </div>
          <div>
            <p class="text-sm font-semibold uppercase text-text-primary">ELSE</p>
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.elseHint') }}</p>
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
              <p v-for="method in ['Slack', 'Teams', 'Discord']" :key="method" class="flex items-center justify-between p-4 text-text-muted">
                <span class="font-semibold">{{ method }}</span>
                <span class="rounded-md border border-app-border px-2 py-1 text-xs">{{ t('workflow.inspector.comingSoon') }}</span>
              </p>
            </div>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.timeoutSetting') }}</span>
            <div class="grid grid-cols-[minmax(0,1fr)_repeat(3,minmax(64px,76px))] gap-2">
              <input type="number" min="0" class="rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm" :value="numberConfig('timeoutValue', 3)" @input="handleNumberInput('timeoutValue', $event)" />
              <button
                v-for="unit in humanTimeoutUnits"
                :key="unit.value"
                type="button"
                class="rounded-lg px-2 py-3 text-sm font-medium transition"
                :class="isTimeoutUnitSelected(unit.value) ? 'border border-primary bg-white text-primary shadow-sm' : 'border border-transparent bg-app-muted text-text-secondary hover:border-primary/40 hover:text-primary'"
                @click="updateConfig('timeoutUnit', unit.value)"
              >
                {{ t(unit.labelKey) }}
              </button>
            </div>
          </label>
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
          <label class="block">
            <span class="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">{{ t('workflow.inspector.input') }} <span class="rounded-md border border-app-border px-2 py-1 text-xs text-text-muted">Array</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('input', '')" @input="handleTextInput('input', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">{{ t('workflow.inspector.output') }} <span class="rounded-md border border-app-border px-2 py-1 text-xs text-text-muted">Array</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('output', '')" @input="handleTextInput('output', $event)" />
          </label>
          <label class="flex items-center justify-between text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.parallelMode') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('parallel', true)" @change="handleToggle('parallel', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-secondary">{{ t('workflow.inspector.maxParallelism') }}</span>
            <div class="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-4">
              <input type="number" min="1" max="20" class="rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm" :value="numberConfig('maxParallelism', 10)" @input="handleNumberInput('maxParallelism', $event)" />
              <input type="range" min="1" max="20" class="accent-primary" :value="numberConfig('maxParallelism', 10)" @input="handleNumberInput('maxParallelism', $event)" />
            </div>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.errorResponseMethod') }}</span>
            <select class="w-full rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm" :value="textConfig('errorMode', 'stop')" @change="handleTextInput('errorMode', $event)">
              <option value="stop">{{ t('workflow.inspector.stopOnError') }}</option>
              <option value="continue">{{ t('status.running') }}</option>
            </select>
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.flattenOutput') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('flattenOutput', true)" @change="handleToggle('flattenOutput', $event)" />
          </label>
        </section>

        <section v-else-if="selectedKind === 'code'" class="space-y-5 p-5">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariables') }}</p>
              <Plus class="h-4 w-4 text-text-muted" />
            </div>
            <div class="space-y-2">
              <div v-for="arg in ['arg1', 'arg2']" :key="arg" class="grid grid-cols-[110px_minmax(0,1fr)_24px] gap-2">
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :value="arg" readonly />
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" />
                <Trash2 class="mt-2 h-4 w-4 text-text-muted" />
              </div>
            </div>
          </div>
          <div class="overflow-hidden rounded-xl bg-app-bg2">
            <div class="flex items-center justify-between border-b border-app-border px-3 py-2 text-sm font-semibold text-text-primary">
              <span>{{ t('workflow.inspector.python3') }}</span>
              <div class="flex gap-2 text-text-muted"><Sparkles class="h-4 w-4" /><Copy class="h-4 w-4" /></div>
            </div>
            <textarea class="h-48 w-full resize-none bg-app-bg2 p-3 font-mono text-sm outline-none" :value="textConfig('code', defaultPythonCode)" @input="handleTextInput('code', $event)" />
          </div>
          <div>
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariablesRequired') }}</p>
              <Plus class="h-4 w-4 text-text-muted" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_110px_24px] gap-2">
              <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" value="result" />
              <select class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm"><option>String</option><option>Number</option><option>Object</option></select>
              <Trash2 class="mt-2 h-4 w-4 text-text-muted" />
            </div>
          </div>
        </section>

        <section v-else-if="selectedKind === 'template-transform'" class="space-y-5 p-5">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariables') }}</p>
              <Plus class="h-4 w-4 text-text-muted" />
            </div>
            <div class="grid grid-cols-[110px_minmax(0,1fr)_24px] gap-2">
              <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" value="arg1" />
              <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" />
              <Trash2 class="mt-2 h-4 w-4 text-text-muted" />
            </div>
          </div>
          <div class="overflow-hidden rounded-xl bg-app-bg2">
            <div class="flex items-center justify-between border-b border-app-border px-3 py-2 text-sm font-semibold text-text-primary">
              <span>{{ t('workflow.inspector.code') }}</span>
              <span class="text-xs text-text-muted">{{ t('workflow.inspector.templateOnly') }}</span>
            </div>
            <textarea class="h-56 w-full resize-none bg-app-bg2 p-3 font-mono text-sm outline-none" :value="textConfig('template', defaultJinjaTemplate)" @input="handleTextInput('template', $event)" />
          </div>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
        </section>

        <section v-else-if="selectedKind === 'document-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('file', '')" @input="handleTextInput('file', $event)" />
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

        <section v-else-if="selectedKind === 'variable-assigner' || selectedKind === 'variable-aggregate'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.assignedVariable') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :value="textConfig('variable', 'conversation.summary')" @input="handleTextInput('variable', $event)" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.assignedValue') }}</span>
            <textarea class="min-h-28 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('value', '')" @input="handleTextInput('value', $event)" />
          </label>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
        </section>

        <section v-else-if="selectedKind === 'parameter-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option v-for="model in availableChatModels" :key="model.id" :value="model.name">{{ modelOptionLabel(model) }}</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('input', '')" @input="handleTextInput('input', $event)" />
          </label>
          <label class="flex items-center justify-between text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.vision') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('vision', false)" @change="handleToggle('vision', $event)" />
          </label>
          <div>
            <div class="mb-2 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.extractionParameters') }} <span class="text-status-error">*</span></p>
              <button class="text-sm text-text-secondary">{{ t('workflow.inspector.importFromTool') }}</button>
            </div>
            <button class="w-full rounded-lg bg-app-bg2 px-3 py-5 text-sm font-medium text-text-muted">{{ t('workflow.inspector.extractionUnset') }}</button>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.instruction') }}</span>
            <textarea class="min-h-32 w-full resize-none rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.instructionPlaceholder')" :value="textConfig('instruction', '')" @input="handleTextInput('instruction', $event)" />
          </label>
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.advancedSettings') }} <ChevronDown class="inline h-4 w-4" /></p>
        </section>

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
              <span class="min-w-0 truncate">{{ dynamicFieldLabel(field) }} <span v-if="field.required" class="text-status-error">*</span></span>
              <span class="shrink-0 rounded-md border border-app-border px-2 py-1 text-[11px] font-medium uppercase text-text-muted">{{ field.type }}</span>
            </span>

            <select
              v-if="isSelectField(field)"
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
              <input type="checkbox" class="accent-primary" :checked="boolConfig(field.name, Boolean(fieldDefaultValue(field)))" @change="handleDynamicFieldToggle(field, $event)" />
            </label>

            <textarea
              v-else-if="isTextareaField(field)"
              class="min-h-28 w-full resize-y rounded-lg border border-app-border bg-white px-3 py-3 font-mono text-sm outline-none focus:border-primary"
              :value="fieldStringValue(field)"
              @input="handleDynamicFieldInput(field, $event)"
            />

            <input
              v-else
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
            <input
              class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
              :value="String(value)"
              @input="handleTextInput(key, $event)"
            />
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
            @click="emit('openCopilot')"
          >
            <Sparkles class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="grid h-8 w-8 place-items-center rounded-md border border-app-border text-text-secondary transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
            :title="t('workflow.openLogs')"
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
