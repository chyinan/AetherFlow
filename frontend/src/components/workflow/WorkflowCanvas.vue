<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Node } from '@vue-flow/core'
import { computed, onMounted } from 'vue'

import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { CanvasPosition, NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeData } from '@/types/workflow'

import WorkflowNode from './WorkflowNode.vue'

const workflowStore = useWorkflowStore()
const uiStore = useUiStore()
const flow = useVueFlow()

const nodes = computed<WorkflowGraphNode[]>({
  get: () => workflowStore.nodes,
  set: (value) => workflowStore.setNodes(value),
})

const edges = computed<WorkflowGraphEdge[]>({
  get: () => workflowStore.edges,
  set: (value) => workflowStore.setEdges(value),
})

function toFlowPosition(event: DragEvent): CanvasPosition {
  const converter = (flow as unknown as { screenToFlowCoordinate?: (position: CanvasPosition) => CanvasPosition }).screenToFlowCoordinate
  return converter ? converter({ x: event.clientX, y: event.clientY }) : { x: event.offsetX, y: event.offsetY }
}

function onDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('application/aetherflow-node')
  if (!raw) {
    return
  }
  const template = JSON.parse(raw) as NodeTemplate
  const node = workflowStore.addNodeFromTemplate(template, toFlowPosition(event))
  uiStore.setSelectedNode(node.id)
}

function onNodeClick(event: { node: Node<WorkflowNodeData> }) {
  uiStore.setSelectedNode(event.node.id)
}

onMounted(() => {
  window.setTimeout(() => {
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2 })
  }, 80)
})
</script>

<template>
  <div class="h-full min-h-0 bg-app-bg aether-grid" @drop.prevent="onDrop" @dragover.prevent>
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
      <Background pattern-color="#CBD5E1" :gap="18" :size="1" />
      <MiniMap pannable zoomable node-color="#2563EB" mask-color="rgba(248, 250, 252, 0.72)" />
      <Controls />

      <template #node-workflow="nodeProps">
        <WorkflowNode
          :id="nodeProps.id"
          :data="nodeProps.data"
          :selected="nodeProps.selected"
        />
      </template>
    </VueFlow>
  </div>
</template>
