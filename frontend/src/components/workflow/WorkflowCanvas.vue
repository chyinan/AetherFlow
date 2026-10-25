<script setup lang="ts">
// pattern: Imperative Shell
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { Node } from '@vue-flow/core'
import { Search } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { isNodeTemplateBlocked } from '@/utils/workflowCapability'
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
const nodeSearch = ref('')
const nodeSearchInput = ref<HTMLInputElement | null>(null)
let requestedFocusNodeId: string | null = null
let initialFitTimer: number | undefined
function cancelPendingFocus() {
  requestedFocusNodeId = null
  window.clearTimeout(initialFitTimer)
  initialFitTimer = undefined
}
// 只跟踪真实图编辑和节点集合；尺寸测量、运行状态与选择标记不取消首次布局重试。
watch([
  () => workflowStore.editRevision,
  () => JSON.stringify(workflowStore.nodes.map((node) => node.id)),
], cancelPendingFocus, { flush: 'sync' })
async function focusRequestedNode() {
  const nodeId = requestedFocusNodeId
  if (!nodeId || !workflowStore.nodes.some((node) => node.id === nodeId)) return
  await nextTick()
  if (nodeId !== requestedFocusNodeId || !workflowStore.nodes.some((node) => node.id === nodeId)) return
  await flow.fitView({ nodes: [nodeId], padding: 0.4, maxZoom: 1, duration: 220 })
}
const implementedNodeKinds = new Set<WorkflowNodeKind>([
  'start',
  'prompt',
  'image-generation',
  'upscale',
  'save-image',
  'ffmpeg',
  'document-extractor',
  'url-fetch',
  'http-request',
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
  'subworkflow',
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
const categoryOrder: NodeTemplate['category'][] = ['Input', 'AI', 'Media', 'Image', 'Transform', 'Output', 'Logic', 'Tool', 'Plugin', 'Workflow', 'MCP']
const filteredTemplates = computed(() => {
  const query = nodeSearch.value.trim().toLowerCase()
  if (!query) return availableTemplates.value
  return availableTemplates.value.filter((template) => [
    template.kind, template.label, template.description,
    templateLabel(template), templateDescription(template),
    template.category, t(`workflow.catalog.categories.${template.category}`),
    template.provider ?? '', ...template.inputs, ...template.outputs,
  ].join(' ').toLowerCase().includes(query))
})
const groupedTemplates = computed(() => [...new Set(filteredTemplates.value.map((template) => template.category))]
  .sort((left, right) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right))
  .map((category) => ({ category, templates: filteredTemplates.value.filter((template) => template.category === category) })))

function clearNodeSearch() {
  nodeSearch.value = ''
  void nextTick(() => nodeSearchInput.value?.focus())
}

function selectNode(nodeId: string) {
  cancelPendingFocus()
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
  if (isNodeTemplateBlocked(template)) {
    event.preventDefault()
    return
  }
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
  if (suppressNextPaletteClick.value || isNodeTemplateBlocked(template)) {
    return
  }
  const offset = workflowStore.nodes.length * 28
  const node = workflowStore.addNodeFromTemplate(template, {
    x: 160 + (offset % 280),
    y: 120 + (offset % 200),
  })
  if (!node) {
    return
  }
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
  if (!node) {
    return
  }
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
  initialFitTimer = window.setTimeout(() => {
    if (requestedFocusNodeId) { void focusRequestedNode(); return }
    ;(flow as unknown as { fitView?: (options?: unknown) => void }).fitView?.({ padding: 0.2 })
  }, 80)
})
onBeforeUnmount(cancelPendingFocus)

defineExpose({
  cancelPendingFocus,
  async focusNode(nodeId: string) {
    if (!workflowStore.nodes.some((node) => node.id === nodeId)) return
    requestedFocusNodeId = nodeId
    await focusRequestedNode()
  },
  async fitCanvas() {
    cancelPendingFocus()
    await nextTick()
    await flow.fitView({ padding: 0.2, duration: 220 })
  },
})
</script>

<template>
  <div class="workflow-grid-shell grid h-[620px] min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app-bg lg:h-full lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1" @click="addMenu = null">
    <aside class="flex max-h-[320px] min-h-0 flex-col border-b border-app-border bg-white lg:max-h-none lg:border-b-0 lg:border-r">
      <div class="border-b border-app-border px-4 py-3">
        <p class="text-sm font-semibold text-text-primary">{{ $t('workflow.currentNodes') }}</p>
        <p class="mt-1 text-xs text-text-muted">{{ $t('workflow.currentNodesHint') }}</p>
        <div class="mt-3 flex items-center gap-2">
          <label class="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-app-border bg-app-muted px-2.5 py-2 focus-within:border-primary">
            <Search class="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <input ref="nodeSearchInput" v-model="nodeSearch" type="search" class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-text-muted" :placeholder="t('workflow.searchNodes')" :aria-label="t('workflow.searchNodes')" />
          </label>
          <button v-if="nodeSearch" type="button" data-action="clear-node-search" class="shrink-0 rounded-md px-1.5 py-2 text-xs text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" @click="clearNodeSearch">{{ t('common.reset') }}</button>
        </div>
      </div>
      <div class="flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-auto p-3 lg:block lg:space-y-4 lg:overflow-x-hidden">
        <section v-for="group in groupedTemplates" :key="group.category" :data-node-category="group.category" class="shrink-0" :aria-label="t(`workflow.catalog.categories.${group.category}`)">
          <h3 class="mb-2 text-xs font-semibold text-text-muted">{{ t(`workflow.catalog.categories.${group.category}`) }}</h3>
          <div class="flex gap-2 lg:block lg:space-y-2">
            <button
              v-for="template in group.templates"
              :key="template.kind"
              :data-node-template="template.kind"
              type="button"
              :disabled="isNodeTemplateBlocked(template)"
              :draggable="!isNodeTemplateBlocked(template)"
              :title="template.availability?.reason ?? undefined"
              class="flex w-[220px] shrink-0 items-start gap-3 rounded-lg border p-3 text-left transition lg:w-full"
              :class="isNodeTemplateBlocked(template)
                ? 'cursor-not-allowed border-app-border bg-app-muted opacity-55'
                : 'border-app-border bg-white hover:border-primary/30 hover:bg-app-bg2 hover:shadow-sm'"
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
                <span v-if="template.availability?.reason" class="mt-1 block text-xs font-medium leading-5 text-status-warning">
                  {{ t('workflow.capabilityUnavailable') }}：{{ template.availability.reason }}
                </span>
                <span class="mt-2 block text-[11px] text-text-muted">{{ template.inputs.join(', ') || $t('common.inputs') }} → {{ template.outputs.join(', ') || $t('common.outputs') }}</span>
              </span>
            </button>
          </div>
        </section>
        <p v-if="availableTemplates.length === 0" class="w-[220px] shrink-0 rounded-lg border border-dashed border-app-border bg-app-bg2 p-3 text-sm text-text-secondary lg:w-auto">
          {{ $t('workflow.noCurrentNodes') }}
        </p>
        <p v-else-if="filteredTemplates.length === 0" data-testid="node-palette-no-results" role="status" class="w-[220px] shrink-0 rounded-lg border border-dashed border-app-border bg-app-bg2 p-3 text-sm text-text-secondary lg:w-auto">{{ t('common.noResult') }}</p>
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
        @node-drag-start="workflowStore.beginNodeDrag"
        @node-drag-stop="workflowStore.endNodeDrag"
        @nodes-initialized="focusRequestedNode"
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
