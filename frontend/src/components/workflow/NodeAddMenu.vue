<script setup lang="ts">
import {
  BookOpen,
  Brain,
  Braces,
  Code2,
  Database,
  FileText,
  Film,
  GitBranch,
  Hand,
  Languages,
  MessageSquare,
  Mic,
  Repeat2,
  RotateCcw,
  Search,
  Sparkles,
  Split,
  Upload,
  Variable,
  X,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useWorkflowStore } from '@/stores/workflowStore'
import type { NodeTemplate, WorkflowNodeKind } from '@/types/workflow'

const props = defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
  select: [template: NodeTemplate]
}>()

const workflowStore = useWorkflowStore()
const { t } = useI18n()
const activeTab = ref<'node' | 'tool'>('node')
const search = ref('')
const hoveredTemplate = ref<NodeTemplate | null>(null)

const iconMap: Record<WorkflowNodeKind, Component> = {
  start: Upload,
  prompt: Sparkles,
  'image-generation': Sparkles,
  upscale: Film,
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

const groupOrder = ['recommended', 'logic', 'transform', 'allTools', 'workflow', 'mcp', 'custom'] as const

const panelStyle = computed(() => {
  const width = typeof window === 'undefined' ? 1280 : window.innerWidth
  const height = typeof window === 'undefined' ? 800 : window.innerHeight
  const maxLeft = Math.max(16, width - 640)
  const maxTop = Math.max(72, height - 620)
  return {
    left: `${Math.min(Math.max(88, props.x + 10), maxLeft)}px`,
    top: `${Math.min(Math.max(72, props.y - 24), maxTop)}px`,
  }
})

function templateLabel(template: NodeTemplate) {
  return t(`workflow.catalog.items.${template.kind}.label`)
}

function templateDescription(template: NodeTemplate) {
  return t(`workflow.catalog.items.${template.kind}.description`)
}

const visibleTemplates = computed(() => {
  const query = search.value.trim().toLowerCase()
  return workflowStore.templates.filter((template) => {
    const catalog = template.catalog ?? 'node'
    if (catalog !== activeTab.value) {
      return false
    }
    if (!query) {
      return true
    }
    return [
      template.kind,
      templateLabel(template),
      templateDescription(template),
      template.category,
      template.provider ?? '',
    ].join(' ').toLowerCase().includes(query)
  })
})

const groupedTemplates = computed(() =>
  groupOrder
    .map((group) => ({
      id: group,
      label: t(`workflow.catalog.groups.${group}`),
      templates: visibleTemplates.value.filter((template) => (template.group ?? 'recommended') === group),
    }))
    .filter((group) => group.templates.length > 0),
)

function selectTemplate(template: NodeTemplate) {
  emit('select', template)
}
</script>

<template>
  <div class="fixed z-40 flex items-start gap-2" :style="panelStyle" @click.stop>
    <section class="w-[288px] overflow-hidden rounded-xl border border-app-border bg-white shadow-panel">
      <div class="flex items-center justify-between border-b border-app-border px-3 pt-3">
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="border-b-2 px-1 pb-2 text-sm font-semibold transition"
            :class="activeTab === 'node' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'"
            @click="activeTab = 'node'"
          >
            {{ t('workflow.catalog.tabs.nodes') }}
          </button>
          <button
            type="button"
            class="border-b-2 px-1 pb-2 text-sm font-semibold transition"
            :class="activeTab === 'tool' ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'"
            @click="activeTab = 'tool'"
          >
            {{ t('workflow.catalog.tabs.tools') }}
          </button>
        </div>
        <button
          type="button"
          class="mb-2 grid h-7 w-7 place-items-center rounded-md text-text-muted hover:bg-app-muted hover:text-text-primary"
          :title="t('common.close')"
          @click="emit('close')"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="border-b border-app-border p-3">
        <label class="flex items-center gap-2 rounded-md border border-app-border bg-app-muted px-3 py-2 text-sm">
          <Search class="h-4 w-4 shrink-0 text-text-muted" />
          <input
            v-model="search"
            class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
            :placeholder="activeTab === 'node' ? t('workflow.catalog.searchNodes') : t('workflow.catalog.searchTools')"
          />
        </label>
      </div>

      <div class="max-h-[500px] overflow-y-auto p-2">
        <section v-for="group in groupedTemplates" :key="group.id" class="mb-3 last:mb-0">
          <p class="px-2 py-1 text-xs font-semibold text-text-muted">{{ group.label }}</p>
          <button
            v-for="template in group.templates"
            :key="template.kind"
            type="button"
            class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-app-bg2"
            @mouseenter="hoveredTemplate = template"
            @focus="hoveredTemplate = template"
            @click="selectTemplate(template)"
          >
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <component :is="iconMap[template.kind]" class="h-4 w-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-text-primary">{{ templateLabel(template) }}</span>
              <span class="mt-0.5 block truncate text-xs text-text-muted">
                {{ template.provider ?? t(`workflow.catalog.categories.${template.category}`) }}
              </span>
            </span>
          </button>
        </section>

        <p v-if="visibleTemplates.length === 0" class="rounded-lg bg-app-bg2 p-3 text-sm text-text-secondary">
          {{ t('common.noResult') }}
        </p>
      </div>
    </section>

    <aside v-if="hoveredTemplate" class="hidden w-[260px] rounded-xl border border-app-border bg-white p-4 shadow-panel xl:block">
      <div class="flex items-center gap-3">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
          <component :is="iconMap[hoveredTemplate.kind]" class="h-4 w-4" />
        </span>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-text-primary">{{ templateLabel(hoveredTemplate) }}</p>
          <p class="truncate text-xs text-text-muted">{{ hoveredTemplate.provider ?? t(`workflow.catalog.categories.${hoveredTemplate.category}`) }}</p>
        </div>
      </div>
      <p class="mt-3 text-sm leading-6 text-text-secondary">{{ templateDescription(hoveredTemplate) }}</p>
      <div class="mt-4 rounded-lg border border-app-border bg-app-bg2 p-3">
        <p class="text-xs font-semibold text-text-muted">{{ t('common.outputs') }}</p>
        <div class="mt-2 flex flex-wrap gap-1">
          <span v-for="output in hoveredTemplate.outputs" :key="output" class="rounded bg-white px-2 py-1 text-[11px] text-text-secondary">
            {{ output }}
          </span>
        </div>
      </div>
    </aside>
  </div>
</template>
