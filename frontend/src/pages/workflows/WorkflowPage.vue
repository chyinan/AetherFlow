<script setup lang="ts">
import { Play, RotateCcw, Save } from 'lucide-vue-next'
import { onMounted } from 'vue'

import NodeInspector from '@/components/workflow/NodeInspector.vue'
import NodePalette from '@/components/workflow/NodePalette.vue'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { workflowApi } from '@/services/api/workflowApi'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const workflowStore = useWorkflowStore()
const runStore = useRunStore()

onMounted(async () => {
  await runStore.loadRuns()
  runStore.subscribeCurrentRun()
})

async function saveWorkflow() {
  await workflowApi.saveWorkflow({
    id: workflowStore.workflowId,
    name: workflowStore.workflowName,
    nodes: workflowStore.nodes,
    edges: workflowStore.edges,
  })
  workflowStore.markSaved()
}

async function startRun() {
  await workflowApi.startRun(workflowStore.workflowId)
  runStore.subscribeCurrentRun()
}
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)_auto]">
    <header class="flex items-center justify-between border-b border-app-border bg-white px-5">
      <div>
        <p class="text-sm font-semibold text-text-primary">{{ workflowStore.workflowName }}</p>
        <p class="text-xs text-text-muted">Mock workflow · {{ workflowStore.nodes.length }} nodes · {{ workflowStore.edges.length }} edges</p>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-app-border bg-white px-3 py-2 text-sm text-text-secondary hover:text-primary" @click="workflowStore.resetMockWorkflow()">
          <RotateCcw class="h-4 w-4" />
          Reset
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-white px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft" @click="saveWorkflow">
          <Save class="h-4 w-4" />
          {{ workflowStore.dirty ? 'Save mock' : 'Saved' }}
        </button>
        <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white shadow-node hover:bg-primary-dark" @click="startRun">
          <Play class="h-4 w-4" />
          Run
        </button>
      </div>
    </header>

    <div class="grid min-h-0 grid-cols-[256px_minmax(0,1fr)_320px]">
      <NodePalette />
      <WorkflowCanvas />
      <NodeInspector />
    </div>

    <RunConsole />
  </section>
</template>
