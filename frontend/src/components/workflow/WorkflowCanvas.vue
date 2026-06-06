<script setup lang="ts">
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Node } from '@vue-flow/core'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useUiStore } from '@/stores/uiStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeData, WorkflowNodeKind } from '@/types/workflow'

import NodeAddMenu from './NodeAddMenu.vue'
import WorkflowNode from './WorkflowNode.vue'

const workflowStore = useWorkflowStore()
const uiStore = useUiStore()
const flow = useVueFlow()
const { t } = useI18n()
const addMenu = ref<{ sourceNodeId: string; x: number; y: number } | null>(null)
const implementedNodeKinds = new Set<WorkflowNodeKind>([
  'start',
  'prompt',
  'image-generation',
  'upscale',
  'save-image',
  'ffmpeg',
  'document-extractor',
  'whisper',
  'llm',
  'translate',
  'summary',
  'knowledge-retrieval',
  'export',
  'output',
  'agent',
  'question-understand',
  'question-classifier',
  'condition',
  'human',
  'iteration',
  'loop',
  'code',
  'template-transform',
  'variable-aggregate',
  'variable-assigner',
  'parameter-extractor',
])

const nodes = computed<WorkflowGraphNode[]>({
  get: () => workflowStore.nodes,
  set: (value) => workflowStore.setNodes(value),
})

const edges = computed<WorkflowGraphEdge[]>({
  get: () => workflowStore.edges,
  set: (value) => workflowStore.setEdges(value),
})

const availableTemplates = computed(() =>
  workflowStore.templates.filter((template) =>
    implementedNodeKinds.has(template.kind)),
)

function selectNode(nodeId: string) {
  uiStore.setSelectedNode(nodeId)
  if (!workflowStore.nodes.some((node) => node.id === nodeId)) {
    return
  }
  workflowStore.setNodes(workflowStore.nodes.map((node) => ({
    ...node,
    selected: node.id === nodeId,
  })))
}

function onNodeClick(event: { node: Node<WorkflowNodeData> }) {
  selectNode(event.node.id)
}

function templateLabel(template: NodeTemplate) {
  return t(`workflow.catalog.items.${template.kind}.label`)
}

function templateDescription(template: NodeTemplate) {
  return t(`workflow.catalog.items.${template.kind}.description`)
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
    selectNode(node.id)
    await nextTick()
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2, duration: 220 })
  }
}

function onTemplateDragStart(event: DragEvent, template: NodeTemplate) {
  event.dataTransfer?.setData('application/aetherflow-node', JSON.stringify(template))
  event.dataTransfer?.setData('text/plain', template.kind)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}

function flowDropPosition(event: DragEvent) {
  const helper = flow as unknown as {
    screenToFlowCoordinate?: (position: { x: number; y: number }) => { x: number; y: number }
  }
  if (helper.screenToFlowCoordinate) {
    return helper.screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  }
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

async function onCanvasDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('application/aetherflow-node')
  if (!raw) {
    return
  }
  const template = JSON.parse(raw) as NodeTemplate
  if (!implementedNodeKinds.has(template.kind)) {
    return
  }
  const node = workflowStore.addNodeFromTemplate(template, flowDropPosition(event))
  selectNode(node.id)
  await nextTick()
}

function testNode(nodeId: string) {
  selectNode(nodeId)
  workflowStore.updateNodeStatus(nodeId, 'running')
  window.setTimeout(() => workflowStore.updateNodeStatus(nodeId, 'success', 0), 180)
}

async function duplicateNode(nodeId: string) {
  const node = workflowStore.duplicateNode(nodeId)
  if (node) {
    selectNode(node.id)
    await nextTick()
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2, duration: 220 })
  }
}

function deleteNode(nodeId: string) {
  const nextNode = workflowStore.nodes.find((node) => node.id !== nodeId)
  workflowStore.deleteNode(nodeId)
  if (nextNode) {
    selectNode(nextNode.id)
  } else {
    uiStore.setSelectedNode(null)
  }
}

onMounted(() => {
  window.setTimeout(() => {
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2 })
  }, 80)
})
</script>

<template>
  <div class="workflow-grid-shell grid h-[480px] min-h-0 grid-cols-[260px_minmax(0,1fr)] overflow-hidden bg-app-bg lg:h-full" @click="addMenu = null">
    <aside class="flex min-h-0 flex-col border-r border-app-border bg-white">
      <div class="border-b border-app-border px-4 py-3">
        <p class="text-sm font-semibold text-text-primary">{{ $t('workflow.currentNodes') }}</p>
        <p class="mt-1 text-xs text-text-muted">{{ $t('workflow.currentNodesHint') }}</p>
      </div>
      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        <button
          v-for="template in availableTemplates"
          :key="template.kind"
          type="button"
          draggable="true"
          class="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition"
          :class="'border-app-border bg-white hover:border-primary/30 hover:bg-app-bg2 hover:shadow-sm'"
          @dragstart="onTemplateDragStart($event, template)"
        >
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary-soft text-xs font-semibold text-primary">
            +
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-text-primary">{{ templateLabel(template) }}</span>
            <span class="mt-1 block line-clamp-2 text-xs leading-5 text-text-secondary">{{ templateDescription(template) }}</span>
            <span class="mt-2 block text-[11px] text-text-muted">{{ template.inputs.join(', ') || $t('common.inputs') }} → {{ template.outputs.join(', ') || $t('common.outputs') }}</span>
          </span>
        </button>
        <p v-if="availableTemplates.length === 0" class="rounded-lg border border-dashed border-app-border bg-app-bg2 p-3 text-sm text-text-secondary">
          {{ $t('workflow.noCurrentNodes') }}
        </p>
      </div>
    </aside>

    <div class="relative min-h-0 min-w-0 overflow-hidden" @dragover.prevent @drop.prevent="onCanvasDrop">
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
            @select="selectNode"
            @test-node="testNode"
            @duplicate-node="duplicateNode"
            @delete-node="deleteNode"
          />
        </template>
      </VueFlow>
    </div>

    <NodeAddMenu
      v-if="addMenu"
      :x="addMenu.x"
      :y="addMenu.y"
      @close="addMenu = null"
      @select="addNodeAfter"
    />
  </div>
</template>
