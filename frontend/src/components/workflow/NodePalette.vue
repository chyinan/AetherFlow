<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useWorkflowStore } from '@/stores/workflowStore'
import type { NodeTemplate } from '@/types/workflow'

const workflowStore = useWorkflowStore()
const search = ref('')

const filteredTemplates = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) {
    return workflowStore.templates
  }
  return workflowStore.templates.filter((template) => {
    return `${template.label} ${template.description} ${template.category}`.toLowerCase().includes(query)
  })
})

function onDragStart(event: DragEvent, template: NodeTemplate) {
  event.dataTransfer?.setData('application/aetherflow-node', JSON.stringify(template))
  event.dataTransfer?.setData('text/plain', template.label)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}
</script>

<template>
  <aside class="flex h-full w-64 flex-col border-r border-app-border bg-white">
    <div class="border-b border-app-border p-4">
      <p class="text-sm font-semibold text-text-primary">Node Palette</p>
      <p class="mt-1 text-xs text-text-muted">Drag nodes into the canvas.</p>
      <label class="mt-3 flex items-center gap-2 rounded-md border border-app-border bg-app-muted px-3 py-2 text-sm">
        <Search class="h-4 w-4 text-text-muted" />
        <input v-model="search" class="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted" placeholder="Search nodes" />
      </label>
    </div>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <button
        v-for="template in filteredTemplates"
        :key="template.kind"
        type="button"
        draggable="true"
        class="w-full rounded-lg border border-app-border bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-node"
        @dragstart="onDragStart($event, template)"
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold text-text-primary">{{ template.label }}</span>
          <span class="rounded bg-app-muted px-2 py-0.5 text-[11px] text-text-secondary">{{ template.category }}</span>
        </div>
        <p class="mt-2 text-xs leading-5 text-text-secondary">{{ template.description }}</p>
        <p class="mt-2 text-[11px] text-text-muted">{{ template.outputs.join(', ') }}</p>
      </button>
    </div>
  </aside>
</template>
