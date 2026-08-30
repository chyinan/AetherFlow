<script setup lang="ts">
// pattern: Imperative Shell
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
const suppressNextPaletteClick = ref(false)
const implementedNodeKinds = new Set<WorkflowNodeKind>([
  'start',
  'prompt',
  'image-generation',
  'upscale',
  'save-image',
  'ffmpeg',
  'document-extractor',
  'url-fetch',
  'whisper',
  'llm',
  'translate',
  'summary',
  'embedding',
  'knowledge-retrieval',
  'notify',
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
  suppressNextPaletteClick.value = true
  event.dataTransfer?.setData('application/aetherflow-node', JSON.stringify(template))
  event.dataTransfer?.setData('text/plain', template.kind)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
  }
}

function onTemplateDragEnd() {
  window.setTimeout(() => {
    suppressNextPaletteClick.value = false
  }, 0)
}

async function addTemplateFromPalette(template: NodeTemplate) {
  if (suppressNextPaletteClick.value) {
    return
  }
  const offset = workflowStore.nodes.length * 28
  const node = workflowStore.addNodeFromTemplate(template, {
    x: 160 + (offset % 280),
    y: 120 + (offset % 200),
  })
  selectNode(node.id)
  await nextTick()
  ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2, duration: 220 })
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNodeTemplate(raw: string): NodeTemplate | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }

  if (!isRecord(parsed)
    || typeof parsed.kind !== 'string'
    || !implementedNodeKinds.has(parsed.kind as WorkflowNodeKind)
    || typeof parsed.label !== 'string'
    || typeof parsed.description !== 'string'
    || !isRecord(parsed.config)
    || !isStringArray(parsed.inputs)
    || !isStringArray(parsed.outputs)) {
    return null
  }

  return parsed as unknown as NodeTemplate
}

async function onCanvasDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('application/aetherflow-node')
  if (!raw) {
    return
  }
  const template = parseNodeTemplate(raw)
  if (!template) {
    return
  }
  const node = workflowStore.addNodeFromTemplate(template, flowDropPosition(event))
  selectNode(node.id)
  await nextTick()
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
  const node = workflowStore.nodes.find((item) => item.id === nodeId)
  if (!node || !window.confirm(t('workflow.deleteNodeConfirm', { name: node.data.label }))) {
    return
  }
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
  <div class="workflow-grid-shell grid h-[620px] min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app-bg lg:h-full lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1" @click="addMenu = null">
    <aside class="flex min-h-0 flex-col border-b border-app-border bg-white lg:border-b-0 lg:border-r">
      <div class="border-b border-app-border px-4 py-3">
        <p class="text-sm font-semibold text-text-primary">{{ $t('workflow.currentNodes') }}</p>
        <p class="mt-1 text-xs text-text-muted">{{ $t('workflow.currentNodesHint') }}</p>
      </div>
      <div class="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3 lg:block lg:space-y-2 lg:overflow-y-auto">
        <button
          v-for="template in availableTemplates"
          :key="template.kind"
          type="button"
          draggable="true"
          class="flex w-[220px] shrink-0 items-start gap-3 rounded-lg border p-3 text-left transition lg:w-full"
          :class="'border-app-border bg-white hover:border-primary/30 hover:bg-app-bg2 hover:shadow-sm'"
          @click="addTemplateFromPalette(template)"
          @dragstart="onTemplateDragStart($event, template)"
          @dragend="onTemplateDragEnd"
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
        <p v-if="availableTemplates.length === 0" class="w-[220px] shrink-0 rounded-lg border border-dashed border-app-border bg-app-bg2 p-3 text-sm text-text-secondary lg:w-auto">
          {{ $t('workflow.noCurrentNodes') }}
        </p>
      </div>
    </aside>

    <div class="relative min-h-0 min-w-0 overflow-hidden" @dragover.prevent @drop.prevent="onCanvasDrop">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :delete-key-code="null"
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
