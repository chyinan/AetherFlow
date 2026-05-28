<script setup lang="ts">
import { Play, RotateCcw, Save } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import AICopilotPanel from '@/components/copilot/AICopilotPanel.vue'
import NodeInspector from '@/components/workflow/NodeInspector.vue'
import NodePalette from '@/components/workflow/NodePalette.vue'
import RunConsole from '@/components/workflow/RunConsole.vue'
import WorkflowCanvas from '@/components/workflow/WorkflowCanvas.vue'
import { workflowApi } from '@/services/api/workflowApi'
import { useRunStore } from '@/stores/runStore'
import { useWorkflowStore } from '@/stores/workflowStore'

const workflowStore = useWorkflowStore()
const runStore = useRunStore()
const route = useRoute()
const showCopilot = ref(false)
const showRunConsole = ref(false)

onMounted(async () => {
  await workflowStore.loadWorkflow(String(route.params.id || 'wf-media-digest'))
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

function openCopilot() {
  showRunConsole.value = false
  showCopilot.value = true
}

function openRunConsole() {
  showCopilot.value = false
  showRunConsole.value = true
}
</script>

<template>
  <section class="grid h-full grid-rows-[56px_minmax(0,1fr)]">
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

    <div class="relative grid min-h-0 min-w-0 grid-cols-[256px_minmax(0,1fr)_340px] overflow-hidden">
      <NodePalette />
      <WorkflowCanvas />
      <NodeInspector @open-copilot="openCopilot" @open-logs="openRunConsole" />

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-6 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-6 opacity-0"
      >
        <div v-if="showCopilot" class="absolute inset-y-0 right-0 z-30 w-[390px] border-l border-app-border bg-white shadow-panel">
          <AICopilotPanel @close="showCopilot = false" />
        </div>
      </Transition>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-x-6 opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-6 opacity-0"
      >
        <div v-if="showRunConsole" class="absolute bottom-4 right-4 top-4 z-20 w-[520px] max-w-[calc(100%-2rem)] overflow-hidden rounded-xl shadow-panel">
          <RunConsole @close="showRunConsole = false" />
        </div>
      </Transition>
    </div>
  </section>
</template>
