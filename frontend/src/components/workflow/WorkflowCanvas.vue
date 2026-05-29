<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Node } from '@vue-flow/core'
import { computed, nextTick, onMounted, ref } from 'vue'

import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeData } from '@/types/workflow'

import NodeAddMenu from './NodeAddMenu.vue'
import WorkflowNode from './WorkflowNode.vue'

const workflowStore = useWorkflowStore()
const uiStore = useUiStore()
const flow = useVueFlow()
const addMenu = ref<{ sourceNodeId: string; x: number; y: number } | null>(null)

const nodes = computed<WorkflowGraphNode[]>({
  get: () => workflowStore.nodes,
  set: (value) => workflowStore.setNodes(value),
})

const edges = computed<WorkflowGraphEdge[]>({
  get: () => workflowStore.edges,
  set: (value) => workflowStore.setEdges(value),
})

function onNodeClick(event: { node: Node<WorkflowNodeData> }) {
  uiStore.setSelectedNode(event.node.id)
}

function openAddMenu(nodeId: string, event: MouseEvent) {
  addMenu.value = {
    sourceNodeId: nodeId,
    x: event.clientX,
    y: event.clientY,
  }
}

async function addNodeAfter(template: NodeTemplate) {
  if (!addMenu.value) {
    return
  }
  const node = workflowStore.addNodeAfter(addMenu.value.sourceNodeId, template)
  addMenu.value = null
  if (node) {
    uiStore.setSelectedNode(node.id)
    await nextTick()
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2, duration: 220 })
  }
}

onMounted(() => {
  window.setTimeout(() => {
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2 })
  }, 80)
})
</script>

<template>
  <div class="workflow-grid-shell relative h-[480px] min-h-0 bg-app-bg lg:h-full" @click="addMenu = null">
    <VueFlow
      v-model:nodes="nodes"
      v-model:edges="edges"
      class="h-full"
      :default-viewport="{ zoom: 0.84, x: 0, y: 0 }"
      :min-zoom="0.4"
      :max-zoom="1.4"
      fit-view-on-init
      @connect="workflowStore.addConnection"
      @node-click="onNodeClick"
    >
      <Background pattern-color="#94A3B8" :gap="24" :size="1" />
      <MiniMap pannable zoomable node-color="#2563EB" mask-color="rgba(248, 250, 252, 0.72)" />
      <Controls />

      <template #node-workflow="nodeProps">
        <WorkflowNode
          :id="nodeProps.id"
          :data="nodeProps.data"
          :selected="nodeProps.selected"
          @add-after="openAddMenu"
        />
      </template>
    </VueFlow>

    <NodeAddMenu
      v-if="addMenu"
      :x="addMenu.x"
      :y="addMenu.y"
      @close="addMenu = null"
      @select="addNodeAfter"
    />
  </div>
</template>
