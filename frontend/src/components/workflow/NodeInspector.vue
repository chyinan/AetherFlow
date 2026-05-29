<script setup lang="ts">
import {
  AudioLines,
  BookOpen,
  Brain,
  Braces,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Database,
  FileJson,
  FileText,
  Film,
  GitBranch,
  Globe2,
  Hand,
  Languages,
  ListChecks,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Plus,
  Play,
  Repeat2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Split,
  TerminalSquare,
  Trash2,
  Variable,
  Wrench,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowNodeKind } from '@/types/workflow'

type ConfigValue = string | number | boolean

const uiStore = useUiStore()
const workflowStore = useWorkflowStore()
const selectedNode = computed(() => workflowStore.nodes.find((node) => node.id === uiStore.selectedNodeId))
const { t } = useI18n()
const emit = defineEmits<{
  openCopilot: []
  openLogs: []
}>()

const iconMap: Record<WorkflowNodeKind, Component> = {
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
  http: Globe2,
  'list-operator': ListChecks,
  audio: AudioLines,
  'code-interpreter': Code2,
  time: Clock3,
  'web-scraper': Globe2,
  json: FileJson,
  markdown: FileText,
  tavily: Globe2,
  firecrawl: Wrench,
  mineru: FileText,
}

const nodeIcon = computed(() => (selectedNode.value ? iconMap[selectedNode.value.data.kind] : SlidersHorizontal))
const runtimeText = computed(() => selectedNode.value?.data.runtime?.lastResult ?? t('workflow.waiting'))
const canRunNode = computed(() => selectedNode.value?.data.kind !== 'list-operator')

const sysVariables = ['sys.user_id', 'sys.app_id', 'sys.workflow_id', 'sys.workflow_run_id']
const httpBodyModes = ['none', 'form-data', 'x-www-form-urlencoded', 'JSON', 'raw', 'binary']
const fileTypes = ['msg', 'pdf', 'xls', 'pptx', 'eml', 'htm', 'docx', 'epub', 'xlsx', 'doc', 'markdown', 'vtt', 'mdx', 'html', 'xml', 'md', 'csv', 'txt', 'properties', 'ppt']
const defaultPythonCode = 'def main(arg1: str, arg2: str):\n    return {\n        "result": arg1 + arg2,\n    }'
const defaultJinjaTemplate = '{{ arg1 }}'

function nodeLabel(kind: string) {
  return t(`workflow.catalog.items.${kind}.label`)
}

function nodeDescription(kind: string) {
  return t(`workflow.catalog.items.${kind}.description`)
}

function updateConfig(key: string, value: ConfigValue) {
  if (!selectedNode.value) {
    return
  }
  workflowStore.updateNodeConfig(selectedNode.value.id, key, value)
}

function configValue(key: string, fallback: ConfigValue = '') {
  return selectedNode.value?.data.config[key] ?? fallback
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
</script>

<template>
  <aside class="flex h-full min-h-0 w-full flex-col border-l border-app-border bg-white lg:w-[420px]">
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
            <MoreHorizontal class="h-4 w-4" />
            <X class="h-4 w-4" />
          </div>
        </div>

        <input
          class="mx-5 mt-5 w-[calc(100%-2.5rem)] rounded-md border border-transparent px-0 py-1 text-sm text-text-secondary outline-none placeholder:text-text-muted focus:border-app-border focus:px-2"
          :placeholder="t('workflow.inspector.addDescription')"
          :value="textConfig('description', '')"
          @input="handleTextInput('description', $event)"
        />

        <div class="mt-5 flex items-center gap-7 px-5">
          <button class="border-b-2 border-primary pb-3 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.settings') }}
          </button>
          <button class="border-b-2 border-transparent pb-3 text-sm font-semibold text-text-muted">
            {{ t('workflow.inspector.lastRun') }}
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <section v-if="selectedNode.data.kind === 'llm'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium text-text-primary outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option value="aether-runtime/mock-gpt">aether-runtime/mock-gpt</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
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

        <section v-else-if="selectedNode.data.kind === 'knowledge-retrieval'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.queryText') }}</span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('query', '')" @input="handleTextInput('query', $event)" />
          </label>
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.knowledgeBase') }} <span class="text-status-error">*</span></span>
              <button class="inline-flex items-center gap-2 text-sm text-text-muted"><SlidersHorizontal class="h-4 w-4" />{{ t('workflow.inspector.retrievalSettings') }}</button>
            </div>
            <button class="w-full rounded-lg bg-app-bg2 px-3 py-5 text-sm font-medium text-text-muted" @click="updateConfig('dataset', 'kb-product-docs')">
              {{ textConfig('dataset', '') || t('workflow.inspector.clickAddKnowledge') }}
            </button>
          </div>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.metadataFilter') }}
            <select class="rounded-md border border-app-border px-3 py-2 text-sm text-text-secondary" :value="textConfig('metadataFilter', 'disabled')" @change="handleTextInput('metadataFilter', $event)">
              <option value="disabled">{{ t('workflow.inspector.disabled') }}</option>
              <option value="enabled">{{ t('status.active') }}</option>
            </select>
          </label>
        </section>

        <section v-else-if="selectedNode.data.kind === 'output' || selectedNode.data.kind === 'summary'" class="space-y-5 p-5">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariablesRequired') }}</p>
              <Plus class="h-4 w-4 text-text-muted" />
            </div>
            <div class="space-y-2">
              <div class="grid grid-cols-[110px_minmax(0,1fr)_24px] gap-2">
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :value="textConfig('outputName', 'answer')" @input="handleTextInput('outputName', $event)" />
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('outputValue', '')" @input="handleTextInput('outputValue', $event)" />
                <Trash2 class="mt-2 h-4 w-4 text-text-muted" />
              </div>
              <div class="grid grid-cols-[110px_minmax(0,1fr)_24px] gap-2">
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" value="files" readonly />
                <input class="rounded-lg border border-transparent bg-app-muted px-3 py-2 text-sm" :placeholder="t('workflow.inspector.setVariable')" />
                <Trash2 class="mt-2 h-4 w-4 text-text-muted" />
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
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.exposeFiles') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('exposeArtifacts', true)" @change="handleToggle('exposeArtifacts', $event)" />
          </label>
        </section>

        <section v-else-if="selectedNode.data.kind === 'agent'" class="space-y-5 p-5">
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
            <div class="space-y-3 text-sm">
              <p><span class="font-mono text-lg font-semibold">text</span> <span class="ml-2 text-text-muted">String</span><br /><span class="text-text-secondary">{{ t('workflow.inspector.generatedContent') }}</span></p>
              <p><span class="font-mono text-lg font-semibold">usage</span> <span class="ml-2 text-text-muted">object</span><br /><span class="text-text-secondary">{{ t('workflow.inspector.modelUsage') }}</span></p>
              <p><span class="font-mono text-lg font-semibold">files</span> <span class="ml-2 text-text-muted">Array[File]</span><br /><span class="text-text-secondary">{{ t('workflow.inspector.generatedFiles') }}</span></p>
              <p><span class="font-mono text-lg font-semibold">json</span> <span class="ml-2 text-text-muted">Array[Object]</span><br /><span class="text-text-secondary">{{ t('workflow.inspector.generatedJson') }}</span></p>
            </div>
          </div>
        </section>

        <section v-else-if="selectedNode.data.kind === 'question-classifier'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option value="aether-runtime/mock-gpt">aether-runtime/mock-gpt</option>
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

        <section v-else-if="selectedNode.data.kind === 'condition'" class="space-y-5 p-5">
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

        <section v-else-if="selectedNode.data.kind === 'human'" class="space-y-5 p-5">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.submissionMethod') }}</p>
              <button class="grid h-8 w-8 place-items-center rounded-md bg-app-bg2 text-text-muted"><Plus class="h-4 w-4" /></button>
            </div>
            <div class="rounded-xl border border-app-border bg-white shadow-sm">
              <button class="flex w-full items-center gap-3 border-b border-app-border p-4 text-left">
                <span class="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white"><MessageSquare class="h-4 w-4" /></span>
                <span><span class="block text-sm font-semibold text-text-primary">Webapp</span><span class="text-xs text-text-secondary">{{ t('workflow.inspector.webappHint') }}</span></span>
              </button>
              <button class="flex w-full items-center gap-3 border-b border-app-border p-4 text-left">
                <span class="grid h-9 w-9 place-items-center rounded-lg bg-primary text-white"><MessageSquare class="h-4 w-4" /></span>
                <span><span class="block text-sm font-semibold text-text-primary">Email</span><span class="text-xs text-text-secondary">{{ t('workflow.inspector.emailHint') }}</span></span>
              </button>
              <p v-for="method in ['Slack', 'Teams', 'Discord']" :key="method" class="flex items-center justify-between p-4 text-text-muted">
                <span class="font-semibold">{{ method }}</span>
                <span class="rounded-md border border-app-border px-2 py-1 text-xs">{{ t('workflow.inspector.comingSoon') }}</span>
              </p>
            </div>
          </div>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.timeoutSetting') }}</span>
            <div class="grid grid-cols-[minmax(0,1fr)_88px_88px] gap-2">
              <input type="number" class="rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm" :value="numberConfig('timeoutValue', 3)" @input="handleNumberInput('timeoutValue', $event)" />
              <button class="rounded-lg border border-primary bg-white text-sm font-medium text-primary">{{ t('workflow.inspector.days') }}</button>
              <button class="rounded-lg bg-app-muted text-sm font-medium text-text-secondary">{{ t('workflow.inspector.hours') }}</button>
            </div>
          </label>
          <div>
            <p class="mb-2 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <p><span class="font-mono text-lg font-semibold">__action_id</span> <span class="ml-2 text-text-muted">string</span></p>
            <p class="text-sm text-text-secondary">{{ t('workflow.inspector.actionId') }}</p>
          </div>
        </section>

        <section v-else-if="selectedNode.data.kind === 'iteration' || selectedNode.data.kind === 'loop'" class="space-y-5 p-5">
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

        <section v-else-if="selectedNode.data.kind === 'code' || selectedNode.data.kind === 'code-interpreter'" class="space-y-5 p-5">
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

        <section v-else-if="selectedNode.data.kind === 'template-transform'" class="space-y-5 p-5">
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

        <section v-else-if="selectedNode.data.kind === 'document-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="text-status-error">*</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('file', '')" @input="handleTextInput('file', $event)" />
            <p class="mt-2 text-sm leading-6 text-text-secondary">{{ t('workflow.inspector.fileTypes', { types: fileTypes.join(', ') }) }}</p>
          </label>
          <div>
            <p class="mb-3 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
            <p><span class="font-mono text-lg font-semibold">text</span> <span class="ml-2 text-text-muted">string</span></p>
            <p class="text-sm text-text-secondary">{{ t('workflow.inspector.extractedText') }}</p>
          </div>
        </section>

        <section v-else-if="selectedNode.data.kind === 'variable-assigner' || selectedNode.data.kind === 'variable-aggregate'" class="space-y-5 p-5">
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

        <section v-else-if="selectedNode.data.kind === 'parameter-extractor'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-text-primary">{{ t('workflow.inspector.model') }} <span class="text-status-error">*</span></span>
            <select class="w-full rounded-lg border border-status-warning bg-amber-50 px-3 py-3 text-sm font-medium outline-none" :value="textConfig('model', '')" @change="handleTextInput('model', $event)">
              <option value="">{{ t('workflow.inspector.configureModel') }}</option>
              <option value="aether-runtime/mock-gpt">aether-runtime/mock-gpt</option>
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

        <section v-else-if="selectedNode.data.kind === 'http'" class="space-y-5 p-5">
          <div>
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.api') }} <span class="text-status-error">*</span></span>
              <span class="text-sm text-text-secondary">{{ t('workflow.inspector.authNone') }} · {{ t('workflow.inspector.importCurl') }}</span>
            </div>
            <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-2">
              <select class="rounded-lg border border-app-border bg-white px-3 py-3 text-sm" :value="textConfig('method', 'GET')" @change="handleTextInput('method', $event)">
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>DELETE</option>
              </select>
              <input class="rounded-lg border border-app-border bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.enterUrl')" :value="textConfig('url', '')" @input="handleTextInput('url', $event)" />
            </div>
          </div>
          <div v-for="table in ['headers', 'params']" :key="table">
            <p class="mb-2 text-sm font-semibold uppercase text-text-primary">{{ t(`workflow.inspector.${table}`) }}</p>
            <div class="grid grid-cols-2 overflow-hidden rounded-lg border border-app-border text-sm">
              <div class="border-b border-r border-app-border px-3 py-2 font-medium text-text-muted">{{ t('workflow.inspector.key') }}</div>
              <div class="border-b border-app-border px-3 py-2 font-medium text-text-muted">{{ t('workflow.inspector.value') }}</div>
              <input class="border-r border-app-border px-3 py-2 outline-none" :placeholder="t('workflow.inspector.variableSlash')" />
              <input class="px-3 py-2 outline-none" :placeholder="t('workflow.inspector.variableSlash')" />
            </div>
          </div>
          <div>
            <p class="mb-2 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.body') }} <span class="text-status-error">*</span></p>
            <div class="flex flex-wrap gap-3">
              <label v-for="mode in httpBodyModes" :key="mode" class="inline-flex items-center gap-2 text-sm text-text-secondary">
                <input name="bodyMode" type="radio" class="accent-primary" :checked="textConfig('bodyMode', 'none') === mode" @change="updateConfig('bodyMode', mode)" />
                {{ mode }}
              </label>
            </div>
          </div>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.ssl') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('ssl', true)" @change="handleToggle('ssl', $event)" />
          </label>
          <div class="border-t border-app-border pt-4">
            <p class="mb-3 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.timeout') }}</p>
            <label class="mb-3 block text-sm text-text-secondary">{{ t('workflow.inspector.connectionTimeout') }}<input class="mt-1 w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 outline-none" :placeholder="t('workflow.inspector.secondsPlaceholder')" /></label>
            <label class="mb-3 block text-sm text-text-secondary">{{ t('workflow.inspector.readTimeout') }}<input class="mt-1 w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 outline-none" :placeholder="t('workflow.inspector.secondsPlaceholder')" /></label>
            <label class="block text-sm text-text-secondary">{{ t('workflow.inspector.writeTimeout') }}<input class="mt-1 w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 outline-none" :placeholder="t('workflow.inspector.secondsPlaceholder')" /></label>
          </div>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.retryOnFailure') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('retry', true)" @change="handleToggle('retry', $event)" />
          </label>
        </section>

        <section v-else-if="selectedNode.data.kind === 'list-operator'" class="space-y-5 p-5">
          <label class="block">
            <span class="mb-2 flex items-center justify-between text-sm font-semibold text-text-primary">{{ t('workflow.inspector.inputVariable') }} <span class="rounded-md border border-app-border px-2 py-1 text-xs text-text-muted">Array</span></span>
            <input class="w-full rounded-lg border border-transparent bg-app-muted px-3 py-3 text-sm outline-none focus:border-primary" :placeholder="t('workflow.inspector.setVariable')" :value="textConfig('input', '')" @input="handleTextInput('input', $event)" />
          </label>
          <label class="flex items-center justify-between text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.filterCondition') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('filter', false)" @change="handleToggle('filter', $event)" />
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.nthItem') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('nth', false)" @change="handleToggle('nth', $event)" />
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.firstN') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('firstN', true)" @change="handleToggle('firstN', $event)" />
          </label>
          <label v-if="boolConfig('firstN', true)" class="block">
            <input type="range" min="1" max="50" class="w-full accent-primary" :value="numberConfig('limit', 10)" @input="handleNumberInput('limit', $event)" />
          </label>
          <label class="flex items-center justify-between border-t border-app-border pt-4 text-sm font-semibold text-text-primary">
            {{ t('workflow.inspector.sort') }}
            <input type="checkbox" class="accent-primary" :checked="boolConfig('sort', true)" @change="handleToggle('sort', $event)" />
          </label>
          <div v-if="boolConfig('sort', true)" class="grid grid-cols-2 gap-2">
            <button class="rounded-lg border border-primary px-3 py-3 text-sm font-medium text-primary">{{ t('workflow.inspector.ascending') }}</button>
            <button class="rounded-lg border border-app-border px-3 py-3 text-sm font-medium text-text-secondary">{{ t('workflow.inspector.descending') }}</button>
          </div>
          <p class="border-t border-app-border pt-4 text-sm font-semibold text-text-primary">{{ t('workflow.inspector.outputVariables') }}</p>
        </section>

        <section v-else class="space-y-5 p-5">
          <div class="rounded-lg border border-app-border bg-app-bg2 p-3">
            <p class="text-sm font-semibold text-text-primary">{{ nodeDescription(selectedNode.data.kind) }}</p>
          </div>
          <label v-for="[key, value] in Object.entries(selectedNode.data.config)" :key="key" class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">{{ key }}</span>
            <input
              class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
              :value="String(value)"
              @input="handleTextInput(key, $event)"
            />
          </label>
        </section>

        <section class="border-t border-app-border p-5">
          <p class="text-sm font-semibold text-text-primary">{{ t('workflow.inspector.nextStep') }}</p>
          <p class="mt-1 text-sm text-text-secondary">{{ t('workflow.inspector.nextStepHint') }}</p>
          <div class="mt-4 flex items-center gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-app-border bg-white text-primary shadow-sm">
              <component :is="nodeIcon" class="h-4 w-4" />
            </span>
            <button class="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed border-app-border bg-app-bg2 px-3 py-3 text-left text-sm text-text-muted">
              <Plus class="h-4 w-4" />
              {{ t('workflow.inspector.selectNextNode') }}
            </button>
          </div>
        </section>

        <section class="border-t border-app-border p-5">
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-text-primary">{{ t('workflow.latestRuntime') }}</p>
            <StatusBadge :status="selectedNode.data.status" />
          </div>
          <p class="mt-2 text-sm text-text-secondary">{{ runtimeText }}</p>
          <p class="mt-1 text-xs text-text-muted">{{ t('workflow.duration') }}: {{ selectedNode.data.runtime?.durationMs ?? 0 }}ms</p>
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
