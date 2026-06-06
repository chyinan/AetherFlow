<script setup lang="ts">
import {
  BookOpen,
  Brain,
  Braces,
  CheckCircle2,
  Code2,
  Copy,
  Database,
  Film,
  FileText,
  GitBranch,
  Hand,
  Languages,
  MessageSquare,
  Mic,
  Plus,
  Play,
  Repeat2,
  RotateCcw,
  Sparkles,
  Split,
  Trash2,
  Upload,
  Variable,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Handle, Position } from '@vue-flow/core'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import type { WorkflowNodeData, WorkflowNodeKind } from '@/types/workflow'

const props = defineProps<{
  id: string
  data: WorkflowNodeData
  selected?: boolean
}>()

const emit = defineEmits<{
  addAfter: [nodeId: string, event: MouseEvent]
  select: [nodeId: string]
  testNode: [nodeId: string]
  duplicateNode: [nodeId: string]
  deleteNode: [nodeId: string]
}>()

const { t } = useI18n()

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

const icon = computed(() => iconMap[props.data.kind])
const isActive = computed(() => props.selected || props.data.status === 'running')
const displayLabel = computed(() => t(`workflow.catalog.items.${props.data.kind}.label`))
const displayDescription = computed(() => t(`workflow.catalog.items.${props.data.kind}.description`))
const nodeRows = computed(() => {
  switch (props.data.kind) {
    case 'question-classifier':
      return [t('workflow.nodeCard.class', { index: 1 }), t('workflow.nodeCard.class', { index: 2 })]
    case 'condition':
      return [
        t('workflow.nodeCard.caseIf', { index: 1 }),
        t('workflow.nodeCard.caseElif', { index: 2 }),
        t('workflow.nodeCard.else'),
      ]
    case 'human':
      return ['ACTION_1', 'TIMEOUT']
    case 'iteration':
    case 'loop':
      return [t('workflow.nodeCard.parallelMode')]
    case 'agent':
      return [t('workflow.nodeCard.agentNotSet')]
    default:
      return []
  }
})
</script>

<template>
  <div
    class="group relative w-[244px] rounded-lg border bg-white shadow-sm transition"
    :class="isActive ? 'border-primary shadow-node' : 'border-app-border hover:border-primary/30 hover:shadow-node'"
    @click.stop="emit('select', id)"
  >
    <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !border-2 !border-white !bg-primary" />
    <div class="border-b border-app-border p-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
            <component :is="icon" class="h-4 w-4" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-text-primary">{{ displayLabel }}</p>
            <p class="truncate text-[11px] text-text-muted">{{ data.kind }}</p>
          </div>
        </div>
        <StatusBadge :status="data.status" />
      </div>
      <p class="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{{ displayDescription }}</p>
    </div>

    <div class="space-y-2 p-3">
      <template v-if="nodeRows.length > 0">
        <div v-for="row in nodeRows" :key="row" class="rounded-md bg-app-muted px-2 py-1.5 text-xs font-semibold text-text-secondary">
          {{ row }}
        </div>
      </template>
      <template v-else>
        <div class="flex items-center justify-between text-[11px] text-text-muted">
          <span>{{ t('common.inputs') }}</span>
          <span>{{ data.inputs.length }}</span>
        </div>
        <div class="flex flex-wrap gap-1">
          <span v-for="input in data.inputs" :key="input" class="rounded bg-app-muted px-1.5 py-0.5 text-[11px] text-text-secondary">
            {{ input }}
          </span>
        </div>
      </template>
      <div class="flex items-center gap-1 text-[11px] text-text-secondary">
        <CheckCircle2 class="h-3 w-3 text-status-success" />
        <span class="truncate">{{ data.runtime?.lastResult ?? t('workflow.waiting') }}</span>
      </div>
    </div>

    <div class="flex items-center justify-between border-t border-app-border px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
      <button
        type="button"
        class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-app-muted hover:text-primary"
        :title="t('workflow.addNextNode')"
        @click.stop="emit('addAfter', id, $event)"
      >
        <Plus class="h-3.5 w-3.5" />
      </button>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-app-muted hover:text-primary"
          :title="t('workflow.testNode')"
          @click.stop="emit('testNode', id)"
        >
          <Play class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-app-muted hover:text-primary"
          :title="t('workflow.duplicateNode')"
          @click.stop="emit('duplicateNode', id)"
        >
          <Copy class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-red-50 hover:text-status-error"
          :title="t('workflow.deleteNode')"
          @click.stop="emit('deleteNode', id)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
    <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-2 !border-white !bg-primary" />
  </div>
</template>
