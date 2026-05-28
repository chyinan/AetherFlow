<script setup lang="ts">
import { SlidersHorizontal, Sparkles, TerminalSquare } from 'lucide-vue-next'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const uiStore = useUiStore()
const workflowStore = useWorkflowStore()
const selectedNode = computed(() => workflowStore.nodes.find((node) => node.id === uiStore.selectedNodeId))
const { t } = useI18n()
const emit = defineEmits<{
  openCopilot: []
  openLogs: []
}>()

function updateConfig(key: string, value: string) {
  if (!selectedNode.value) {
    return
  }
  workflowStore.updateNodeConfig(selectedNode.value.id, key, value)
}
</script>

<template>
  <aside class="flex h-full w-[340px] flex-col border-l border-app-border bg-white">
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

    <div v-if="selectedNode" class="min-h-0 flex-1 overflow-y-auto p-4">
      <div class="mb-4 rounded-lg border border-app-border bg-app-bg2 p-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-text-primary">{{ selectedNode.data.label }}</p>
          <StatusBadge :status="selectedNode.data.status" />
        </div>
        <p class="mt-2 text-xs leading-5 text-text-secondary">{{ selectedNode.data.description }}</p>
      </div>

      <section class="mb-5">
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{{ t('workflow.config') }}</h3>
        <div class="space-y-3">
          <label v-for="[key, value] in Object.entries(selectedNode.data.config)" :key="key" class="block">
            <span class="mb-1 block text-xs font-medium text-text-secondary">{{ key }}</span>
            <input
              class="w-full rounded-md border border-app-border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary"
              :value="String(value)"
              @input="updateConfig(key, ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
      </section>

      <section class="mb-5 grid grid-cols-2 gap-3">
        <div class="rounded-lg border border-app-border p-3">
          <p class="text-xs font-semibold text-text-muted">{{ t('common.inputs') }}</p>
          <p v-for="input in selectedNode.data.inputs" :key="input" class="mt-2 rounded bg-app-muted px-2 py-1 text-xs text-text-secondary">
            {{ input }}
          </p>
        </div>
        <div class="rounded-lg border border-app-border p-3">
          <p class="text-xs font-semibold text-text-muted">{{ t('common.outputs') }}</p>
          <p v-for="output in selectedNode.data.outputs" :key="output" class="mt-2 rounded bg-primary-soft px-2 py-1 text-xs text-primary">
            {{ output }}
          </p>
        </div>
      </section>

      <section class="rounded-lg border border-app-border bg-sidebar p-3 text-text-inverse">
        <p class="text-xs font-semibold text-slate-300">{{ t('workflow.latestRuntime') }}</p>
        <p class="mt-2 text-sm">{{ selectedNode.data.runtime?.lastResult ?? t('workflow.waiting') }}</p>
        <p class="mt-2 text-xs text-slate-400">
          {{ t('workflow.duration') }}: {{ selectedNode.data.runtime?.durationMs ?? 0 }}ms
        </p>
      </section>
    </div>

    <div v-else class="p-4 text-sm text-text-secondary">{{ t('workflow.noNodeSelected') }}</div>
  </aside>
</template>
