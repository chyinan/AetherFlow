<script setup lang="ts">
import {
  Brain,
  CheckCircle2,
  Copy,
  Film,
  Languages,
  MessageSquare,
  Mic,
  Play,
  Trash2,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Handle, Position } from '@vue-flow/core'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useUiStore } from '@/stores/uiStore'
import type { WorkflowNodeData, WorkflowNodeKind } from '@/types/workflow'

const props = defineProps<{
  id: string
  data: WorkflowNodeData
  selected?: boolean
}>()

const uiStore = useUiStore()
const { t } = useI18n()

const iconMap: Record<WorkflowNodeKind, Component> = {
  whisper: Mic,
  llm: Brain,
  ffmpeg: Film,
  translate: Languages,
  summary: MessageSquare,
}

const icon = computed(() => iconMap[props.data.kind])
const isActive = computed(() => props.selected || props.data.status === 'running')
</script>

<template>
  <div
    class="group w-[244px] rounded-lg border bg-white shadow-sm transition"
    :class="isActive ? 'border-primary shadow-node' : 'border-app-border hover:border-primary/30 hover:shadow-node'"
    @click="uiStore.setSelectedNode(id)"
  >
    <Handle type="target" :position="Position.Left" class="!h-3 !w-3 !border-2 !border-white !bg-primary" />
    <div class="border-b border-app-border p-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
            <component :is="icon" class="h-4 w-4" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-text-primary">{{ data.label }}</p>
            <p class="truncate text-[11px] text-text-muted">{{ data.kind }}</p>
          </div>
        </div>
        <StatusBadge :status="data.status" />
      </div>
      <p class="mt-2 line-clamp-2 text-xs leading-5 text-text-secondary">{{ data.description }}</p>
    </div>

    <div class="space-y-2 p-3">
      <div class="flex items-center justify-between text-[11px] text-text-muted">
        <span>{{ t('common.inputs') }}</span>
        <span>{{ data.inputs.length }}</span>
      </div>
      <div class="flex flex-wrap gap-1">
        <span v-for="input in data.inputs" :key="input" class="rounded bg-app-muted px-1.5 py-0.5 text-[11px] text-text-secondary">
          {{ input }}
        </span>
      </div>
        <div class="flex items-center gap-1 text-[11px] text-text-secondary">
          <CheckCircle2 class="h-3 w-3 text-status-success" />
          <span>{{ data.runtime?.lastResult ?? t('workflow.waiting') }}</span>
        </div>
      </div>

    <div class="flex items-center justify-end gap-1 border-t border-app-border px-2 py-1.5 opacity-0 transition group-hover:opacity-100">
      <button class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-app-muted hover:text-primary" :title="t('workflow.testNode')">
        <Play class="h-3.5 w-3.5" />
      </button>
      <button class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-app-muted hover:text-primary" :title="t('workflow.duplicateNode')">
        <Copy class="h-3.5 w-3.5" />
      </button>
      <button class="grid h-7 w-7 place-items-center rounded text-text-muted hover:bg-red-50 hover:text-status-error" :title="t('workflow.deleteNode')">
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
    <Handle type="source" :position="Position.Right" class="!h-3 !w-3 !border-2 !border-white !bg-primary" />
  </div>
</template>
