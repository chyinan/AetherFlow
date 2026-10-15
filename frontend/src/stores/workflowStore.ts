// pattern: Mixed (needs refactoring)
import { defineStore } from 'pinia'
import type { Connection } from '@vue-flow/core'
import { toRaw } from 'vue'

import { getWorkflowCapabilities } from '@/api/modules/ai'
import { getNodeCatalog, type WorkflowNodeCatalogItem } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { getBackendDefinitionId, workflowApi } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { isWorkflowCapabilitySnapshot } from '@/utils/capabilitySupport'
import type { CanvasPosition, NodeTemplate, WorkflowDefinition, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind, WorkflowNodeStatus } from '@/types/workflow'
import { createWorkflowNodeDataFromTemplate, duplicateWorkflowNode } from '@/utils/workflowNodeClone'
import { mergeWorkflowNodeConfig } from '@/utils/workflowNodeConfig'
import { applyWorkflowCapabilities, canConfigureNodeRuntime, unavailableWorkflowCapabilities } from '@/utils/workflowCapability'
import { findDuplicateNodePosition } from '@/utils/workflowNodePlacement'
import type { CopilotWorkflowDraftApplyRequest } from '@/types/copilotWorkflowPlan'

function cloneNodes() {
  return [] as WorkflowGraphNode[]
}

function cloneEdges() {
  return [] as WorkflowGraphEdge[]
}

function serializeNodesWithoutSelection(nodes: WorkflowGraphNode[]) {
  return JSON.stringify(nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  })))
}

function serializeEdgesWithoutSelection(edges: ReadonlyArray<WorkflowGraphEdge>) {
  return JSON.stringify(edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label ?? '' })))
}

type WorkflowGraphHistoryEntry = {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
}

function cloneGraph(nodes: WorkflowGraphNode[], edges: WorkflowGraphEdge[]): WorkflowGraphHistoryEntry {
  return {
    nodes: nodes.map((node) => {
      const rawNode = toRaw(node)
      const rawData = toRaw(rawNode.data)
      return {
        ...rawNode,
        position: { ...toRaw(rawNode.position) },
        data: {
          ...rawData,
          config: { ...toRaw(rawData.config) },
          inputs: [...rawData.inputs],
          outputs: [...rawData.outputs],
          ...(rawData.runtime ? { runtime: { ...toRaw(rawData.runtime) } } : {}),
        },
      }
    }),
    edges: edges.map((edge) => ({ ...toRaw(edge) })),
  }
}

// 工作流的普通对象和数组可能包含显式嵌套的 Vue Proxy，单次 toRaw 不足以解除代理。
// 保留循环引用；其他值仍交给 structuredClone 校验，不能静默丢弃不可克隆的数据。
function unwrapWorkflowCloneValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value
  const raw = toRaw(value)
  if (seen.has(raw)) return seen.get(raw)
  const prototype = Object.getPrototypeOf(raw)
  if (!Array.isArray(raw) && prototype !== Object.prototype && prototype !== null) return raw
  const result = Array.isArray(raw) ? new Array(raw.length) : Object.create(prototype)
  seen.set(raw, result)
  for (const [key, nested] of Object.entries(raw)) {
    Object.defineProperty(result, key, {
      value: unwrapWorkflowCloneValue(nested, seen),
      enumerable: true, configurable: true, writable: true,
    })
  }
  return result
}

let nodeCounter = 10
let edgeCounter = 10
let workflowLoadRequestCounter = 0

const NODE_KIND_BY_BACKEND_TYPE: Partial<Record<string, WorkflowNodeKind>> = {
  START: 'start',
  PROMPT: 'prompt',
  IMAGE_GENERATION: 'image-generation',
  UPSCALE: 'upscale',
  SAVE_IMAGE: 'save-image',
  URL_FETCH: 'url-fetch',
  HTTP_REQUEST: 'http-request',
  UPLOAD: 'upload',
  FFMPEG: 'ffmpeg',
  WHISPER: 'whisper',
  LLM: 'llm',
  TRANSLATE: 'translate',
  SUMMARY: 'summary',
  OCR: 'document-extractor',
  EMBEDDING: 'embedding',
  KNOWLEDGE_RETRIEVAL: 'knowledge-retrieval',
  NOTIFY: 'notify',
  EXPORT: 'export',
  END: 'output',
  AGENT: 'agent',
  QUESTION_UNDERSTAND: 'question-understand',
  QUESTION_CLASSIFIER: 'question-classifier',
  CONDITION: 'condition',
  HUMAN: 'human',
  ITERATION: 'iteration',
  LOOP: 'loop',
  SUBWORKFLOW: 'subworkflow',
  CODE: 'code',
  TEMPLATE_TRANSFORM: 'template-transform',
  VARIABLE_AGGREGATE: 'variable-aggregate',
  VARIABLE_ASSIGNER: 'variable-assigner',
  PARAMETER_EXTRACTOR: 'parameter-extractor',
}

const CATEGORY_BY_BACKEND_CATEGORY: Record<string, NodeTemplate['category']> = {
  Control: 'Logic',
  File: 'Input',
  AI: 'AI',
  Image: 'Image',
  Transform: 'Transform',
  Output: 'Output',
  Notification: 'Output',
  Utility: 'Tool',
}

const RECOMMENDED_BACKEND_TYPES = new Set([
  'START',
  'UPLOAD',
  'URL_FETCH',
  'HTTP_REQUEST',
  'OCR',
  'EMBEDDING',
  'KNOWLEDGE_RETRIEVAL',
  'SUMMARY',
  'EXPORT',
  'END',
])

function createNodeFromTemplate(template: NodeTemplate, position: CanvasPosition): WorkflowGraphNode {
  return {
    id: `node-${template.kind}-${nodeCounter++}`,
    type: 'workflow',
    position,
    data: createWorkflowNodeDataFromTemplate(template, i18n.global.t('workflow.mockResults.newNode')),
  }
}

function branchLabelForConnection(source: Readonly<WorkflowGraphNode>, outgoingCount: number, outgoingLabels: unknown[] = []) {
  if (source.data.kind === 'http-request' && String(source.data.config.errorStrategy).toUpperCase() === 'BRANCH') {
    const used = new Set(outgoingLabels.map((label) => String(label ?? '').trim().toLowerCase()))
    return ['success', 'error'].find((label) => !used.has(label))
  }
  if (source.data.kind !== 'condition') {
    return source.data.outputs[0]
  }
  const fallback = outgoingCount === 0 ? 'true' : outgoingCount === 1 ? 'false' : undefined
  if (!fallback) {
    return undefined
  }
  const configured = outgoingCount === 0
    ? source.data.config.trueBranch
    : source.data.config.falseBranch
  return typeof configured === 'string' && configured.trim() ? configured.trim() : fallback
}

function backendTypeOf(item: WorkflowNodeCatalogItem) {
  return String(item.type ?? item.nodeType ?? '').trim().toUpperCase()
}

function variableNames(variables: WorkflowNodeCatalogItem['inputVariables'] | WorkflowNodeCatalogItem['outputVariables']) {
  return (variables ?? [])
    .map((variable) => variable.name)
    .filter((name) => typeof name === 'string' && name.trim())
}

export function templateFromCatalogItem(item: WorkflowNodeCatalogItem): NodeTemplate | null {
  const backendType = backendTypeOf(item)
  const kind = NODE_KIND_BY_BACKEND_TYPE[backendType]
  if (!kind) {
    return null
  }

  const fallback = nodeTemplates.find((template) => template.kind === kind)
  const category = CATEGORY_BY_BACKEND_CATEGORY[String(item.category ?? '')] ?? fallback?.category ?? 'Tool'
  const group = RECOMMENDED_BACKEND_TYPES.has(backendType)
    ? 'recommended'
    : category === 'Logic'
      ? 'logic'
      : category === 'Transform'
        ? 'transform'
        : fallback?.group ?? 'custom'

  return {
    kind,
    label: item.displayName?.trim() || fallback?.label || kind,
    description: item.description?.trim() || fallback?.description || '',
    category,
    catalog: fallback?.catalog ?? 'node',
    group,
    provider: fallback?.provider,
    // Catalog examples are documentation/placeholder values, not executable defaults.
    // Keep only safe local defaults so a new node cannot target another user's file or dataset.
    config: structuredClone(fallback?.config ?? {}),
    inputs: variableNames(item.inputVariables).length > 0 ? variableNames(item.inputVariables) : fallback?.inputs ?? [],
    outputs: variableNames(item.outputVariables).length > 0 ? variableNames(item.outputVariables) : fallback?.outputs ?? [],
    capabilities: item.capabilities ?? fallback?.capabilities,
    configSchema: item.configSchema,
    outputSchema: item.outputVariables,
  }
}

function mergeTemplates(fallbackTemplates: NodeTemplate[], catalogTemplates: NodeTemplate[]) {
  const templatesByKind = new Map<WorkflowNodeKind, NodeTemplate>()
  fallbackTemplates.forEach((template) => templatesByKind.set(template.kind, template))
  catalogTemplates.forEach((template) => templatesByKind.set(template.kind, template))
  return Array.from(templatesByKind.values())
}

function templateUnavailableReason(templates: ReadonlyArray<NodeTemplate>, template: Readonly<NodeTemplate>) {
  if (canConfigureNodeRuntime(template.kind)) return null
  const currentTemplate = templates.find((item) => item.kind === template.kind)
  const availability = currentTemplate?.availability ?? template.availability
  return availability?.available === false
    ? availability.reason ?? 'Node capability is unavailable'
    : null
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflowId: 'new',
    workflowName: 'Untitled Workflow',
    workflowDescription: '',
    backendDefinitionId: null as number | null,
    backendVersion: null as number | null,
    createIdempotencyKey: null as string | null,
    createIntent: null as { workflow: WorkflowDefinition; editRevision: number } | null,
    projectId: null as number | null,
    templates: nodeTemplates,
    nodeTemplatesRequestSequence: 0,
    nodeCatalogLoaded: false,
    capabilitiesLoaded: false,
    workflowTemplates: [] as WorkflowDefinition[],
    workflowTemplatesRequestSequence: 0,
    workflowTemplatesLoading: false,
    workflowTemplatesError: null as string | null,
    nodes: cloneNodes(),
    edges: cloneEdges(),
    dirty: false,
    editRevision: 0,
    loading: false,
    loadingError: null as string | null,
    saving: false,
    savingError: null as string | null,
    workflowSaveRequestSequence: 0,
    runError: null as string | null,
    historyPast: [] as WorkflowGraphHistoryEntry[],
    historyFuture: [] as WorkflowGraphHistoryEntry[],
    historyLimit: 50,
  }),
  getters: {
    canUndo: (state) => state.historyPast.length > 0,
    canRedo: (state) => state.historyFuture.length > 0,
  },
  actions: {
    recordHistory() {
      this.historyPast = [...this.historyPast, cloneGraph(this.nodes, this.edges)].slice(-this.historyLimit)
      this.historyFuture = []
    },
    markDirty() {
      this.editRevision += 1
      this.dirty = true
      this.savingError = null
      this.runError = null
    },
    setRunError(message: string | null) {
      this.runError = message
    },
    async loadNodeTemplates(isCurrent: () => boolean = () => true) {
      const sequence = ++this.nodeTemplatesRequestSequence
      const [catalogResult, capabilityResult] = await Promise.allSettled([
        getNodeCatalog(),
        getWorkflowCapabilities(),
      ])
      // 已关闭向导、切换节点或被新请求取代的结果不能覆盖当前能力。
      if (sequence !== this.nodeTemplatesRequestSequence || !isCurrent()) return false
      let catalogLoaded = catalogResult.status === 'fulfilled' && Array.isArray(catalogResult.value)
        && catalogResult.value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
      const capabilitiesLoaded = capabilityResult.status === 'fulfilled' && isWorkflowCapabilitySnapshot(capabilityResult.value)
      let templates = nodeTemplates
      if (catalogLoaded && catalogResult.status === 'fulfilled') {
        try {
          templates = mergeTemplates(nodeTemplates, catalogResult.value
            .map(templateFromCatalogItem)
            .filter((template): template is NodeTemplate => template !== null))
        } catch {
          // 损坏的目录不能阻止能力失败关闭，也不能保留“目录已确认”的旧标记。
          catalogLoaded = false
        }
      }
      const capabilities = capabilitiesLoaded && capabilityResult.status === 'fulfilled'
        ? capabilityResult.value
        : unavailableWorkflowCapabilities('AI capability service unavailable')
      this.nodeCatalogLoaded = catalogLoaded
      this.capabilitiesLoaded = capabilitiesLoaded
      this.templates = applyWorkflowCapabilities(templates, capabilities)
      return capabilitiesLoaded
    },
    invalidateWorkflowTemplatesLoad() {
      this.workflowTemplatesRequestSequence += 1
      this.workflowTemplatesLoading = false
      this.workflowTemplatesError = null
    },
    async loadWorkflowTemplates() {
      const requestSequence = ++this.workflowTemplatesRequestSequence
      this.workflowTemplatesLoading = true
      this.workflowTemplatesError = null
      try {
        const templates = await workflowApi.listWorkflowTemplates()
        if (requestSequence !== this.workflowTemplatesRequestSequence) return
        this.workflowTemplates = templates
        return this.workflowTemplates
      } catch (error) {
        if (requestSequence !== this.workflowTemplatesRequestSequence) return
        const details = error instanceof Error && error.message ? error.message : 'workflow templates unavailable'
        this.workflowTemplatesError = details
        throw error
      } finally {
        if (requestSequence === this.workflowTemplatesRequestSequence) this.workflowTemplatesLoading = false
      }
    },
    applyWorkflowDefinition(workflow: WorkflowDefinition, dirty = false) {
      // 先完成整张图的克隆；失败时不得改变身份、画布、历史或使正在加载的请求失效。
      const graph = structuredClone(unwrapWorkflowCloneValue({
        nodes: workflow.nodes,
        edges: workflow.edges,
      })) as WorkflowGraphHistoryEntry
      workflowLoadRequestCounter += 1
      this.workflowId = workflow.id
      this.workflowName = workflow.name
      this.workflowDescription = workflow.description ?? ''
      this.backendDefinitionId = workflow.backendDefinitionId ?? null
      this.backendVersion = workflow.backendVersion ?? null
      this.createIdempotencyKey = workflow.backendDefinitionId || dirty ? null : this.createIdempotencyKey
      if (!this.createIdempotencyKey) this.createIntent = null
      this.projectId = workflow.projectId ?? this.projectId ?? null
      this.nodes = graph.nodes
      this.edges = graph.edges
      this.historyPast = []
      this.historyFuture = []
      this.editRevision += 1
      this.dirty = dirty
      this.loadingError = null
      this.saving = false
      this.savingError = null
      this.runError = null
    },
    applyCopilotWorkflowDraft(request: CopilotWorkflowDraftApplyRequest) {
      const baseMatches = this.workflowId === request.baseWorkflowId
        && this.editRevision === request.baseEditRevision
        && this.backendDefinitionId === request.baseDefinitionId
        && this.backendVersion === request.baseVersion
      const nodesAreAvailable = request.nodes.every((node) => {
        const template = this.templates.find((item) => item.kind === node.data.kind)
        return Boolean(template) && template?.availability?.available !== false
      })
      const hasOneStart = request.nodes.filter((node) => node.data.kind === 'start').length === 1
      const idsAreUnique = new Set(request.nodes.map((node) => node.id)).size === request.nodes.length
      if (!baseMatches || !nodesAreAvailable || !hasOneStart || !idsAreUnique) {
        return false
      }
      // 先解除候选图中的 Vue 代理并整体克隆，失败时保留画布和撤销重做历史。
      const graph = structuredClone(unwrapWorkflowCloneValue({
        nodes: request.nodes,
        edges: request.edges,
      })) as WorkflowGraphHistoryEntry
      this.recordHistory()
      this.nodes = graph.nodes
      this.edges = graph.edges
      this.markDirty()
      return true
    },
    useWorkflowTemplate(workflow: WorkflowDefinition) {
      this.applyWorkflowDefinition({
        ...workflow,
        id: 'new',
        backendDefinitionId: undefined,
        backendVersion: undefined,
        projectId: this.projectId ?? workflow.projectId,
      }, true)
      return this.nodes
    },
    async copyCurrentWorkflow(name?: string) {
      if (!this.backendDefinitionId) {
        throw new Error('backend workflow definition is required before copying')
      }
      const copied = await workflowApi.copyWorkflow(String(this.backendDefinitionId), name)
      this.applyWorkflowDefinition(copied)
      return copied
    },
    setNodes(nodes: WorkflowGraphNode[]) {
      const changed = serializeNodesWithoutSelection(nodes) !== serializeNodesWithoutSelection(this.nodes)
      if (changed) {
        this.recordHistory()
      }
      this.nodes = nodes
      if (changed) {
        this.markDirty()
      }
    },
    setEdges(edges: WorkflowGraphEdge[]) {
      const changed = serializeEdgesWithoutSelection(edges) !== serializeEdgesWithoutSelection(this.edges)
      if (changed) this.recordHistory()
      this.edges = edges
      if (changed) this.markDirty()
    },
    addConnection(connection: Connection) {
      if (!connection.source || !connection.target) {
        return
      }
      const source = this.nodes.find((node) => node.id === connection.source)
      this.recordHistory()
      const outgoingCount = this.edges.filter((edge) => edge.source === connection.source).length
      this.edges.push({
        ...connection,
        id: `edge-${edgeCounter++}`,
        animated: true,
        label: source ? branchLabelForConnection(source, outgoingCount, this.edges.filter((edge) => edge.source === source.id).map((edge) => edge.label)) : undefined,
      })
      this.markDirty()
    },
    addNodeFromTemplate(template: NodeTemplate, position: CanvasPosition) {
      const unavailableReason = templateUnavailableReason(this.templates, template)
      if (unavailableReason) {
        this.runError = `${i18n.global.t('workflow.capabilityUnavailable')}：${unavailableReason}`
        return null
      }
      this.recordHistory()
      const node = createNodeFromTemplate(template, position)
      this.nodes.push(node)
      this.markDirty()
      return node
    },
    addNodeAfter(sourceNodeId: string, template: NodeTemplate) {
      const unavailableReason = templateUnavailableReason(this.templates, template)
      if (unavailableReason) {
        this.runError = `${i18n.global.t('workflow.capabilityUnavailable')}：${unavailableReason}`
        return null
      }
      const source = this.nodes.find((node) => node.id === sourceNodeId)
      if (!source) {
        return null
      }
      const outgoingCount = this.edges.filter((edge) => edge.source === sourceNodeId).length
      const yOffsets = [0, 150, -150, 300, -300]
      const basePosition = {
        x: source.position.x + 320,
        y: source.position.y + yOffsets[outgoingCount % yOffsets.length] + Math.floor(outgoingCount / yOffsets.length) * 150,
      }
      const position = { ...basePosition }
      while (this.nodes.some((node) => Math.abs(node.position.x - position.x) < 260 && Math.abs(node.position.y - position.y) < 130)) {
        position.y += 150
      }
      const node = createNodeFromTemplate(template, position)
      this.recordHistory()
      this.nodes.push(node)
      this.edges.push({
        id: `edge-${edgeCounter++}`,
        source: source.id,
        target: node.id,
        animated: true,
        label: branchLabelForConnection(source, outgoingCount, this.edges.filter((edge) => edge.source === source.id).map((edge) => edge.label)),
      })
      this.markDirty()
      return node
    },
    duplicateNode(nodeId: string) {
      const source = this.nodes.find((node) => node.id === nodeId)
      if (!source) {
        return null
      }
      const template = this.templates.find((item) => item.kind === source.data.kind)
      const unavailableReason = template
        ? templateUnavailableReason(this.templates, template)
        : null
      if (unavailableReason) {
        this.runError = `${i18n.global.t('workflow.capabilityUnavailable')}：${unavailableReason}`
        return null
      }
      const node = duplicateWorkflowNode(source, {
        id: `${source.id}-copy-${nodeCounter++}`,
        position: findDuplicateNodePosition(source, this.nodes),
        lastResult: i18n.global.t('workflow.mockResults.newNode'),
      })
      this.recordHistory()
      this.nodes.push(node)
      this.markDirty()
      return node
    },
    deleteNode(nodeId: string) {
      const beforeLength = this.nodes.length
      if (this.nodes.some((node) => node.id === nodeId)) {
        this.recordHistory()
      }
      this.nodes = this.nodes.filter((node) => node.id !== nodeId)
      this.edges = this.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      if (this.nodes.length !== beforeLength) {
        this.markDirty()
      }
    },
    updateNodeStatus(nodeId: string, status: WorkflowNodeStatus, durationMs?: number) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (node) {
        node.data.status = status
        const runtime = {
          ...node.data.runtime,
          lastResult: status === 'success' ? 'completed' : status,
        }
        if (durationMs !== undefined) {
          runtime.durationMs = durationMs
        }
        node.data.runtime = {
          ...runtime,
        }
      }
    },
    updateNodeConfig(nodeId: string, key: string, value: unknown) {
      this.updateNodeConfigValues(nodeId, { [key]: value })
    },
    updateNodeConfigValues(nodeId: string, values: Record<string, unknown>) {
      const node = this.nodes.find((item) => item.id === nodeId)
      if (node) {
        this.recordHistory()
        node.data.config = mergeWorkflowNodeConfig(node.data.kind, node.data.config, values)
        node.data.runtime = {
          ...node.data.runtime,
          lastResult: i18n.global.t('workflow.mockResults.configUpdated'),
        }
        this.markDirty()
      }
    },
    resetToEmptyWorkflow() {
      workflowLoadRequestCounter += 1
      this.workflowId = 'new'
      this.workflowName = 'Untitled Workflow'
      this.workflowDescription = ''
      this.backendDefinitionId = null
      this.backendVersion = null
      this.createIdempotencyKey = null
      this.createIntent = null
      this.projectId = null
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.editRevision += 1
      this.dirty = false
      this.loading = false
      this.loadingError = null
      this.saving = false
      this.savingError = null
      this.runError = null
      this.historyPast = []
      this.historyFuture = []
    },
    clearCurrentWorkflow() {
      this.recordHistory()
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.markDirty()
    },
    markSaved() {
      this.dirty = false
      this.savingError = null
      this.runError = null
    },
    undo() {
      const previous = this.historyPast.at(-1)
      if (!previous) {
        return false
      }
      this.historyPast = this.historyPast.slice(0, -1)
      this.historyFuture = [...this.historyFuture, cloneGraph(this.nodes, this.edges)].slice(-this.historyLimit)
      const restored = cloneGraph(previous.nodes, previous.edges)
      this.nodes = restored.nodes
      this.edges = restored.edges
      this.markDirty()
      return true
    },
    redo() {
      const next = this.historyFuture.at(-1)
      if (!next) {
        return false
      }
      this.historyFuture = this.historyFuture.slice(0, -1)
      this.historyPast = [...this.historyPast, cloneGraph(this.nodes, this.edges)].slice(-this.historyLimit)
      const restored = cloneGraph(next.nodes, next.edges)
      this.nodes = restored.nodes
      this.edges = restored.edges
      this.markDirty()
      return true
    },
    async loadWorkflow(workflowId: string, options: { initialName?: string } = {}): Promise<boolean> {
      const requestId = ++workflowLoadRequestCounter
      this.loading = true
      this.loadingError = null
      // 导航开始即解除旧工作流的保存反馈，加载失败也不能留下旧的忙碌状态。
      this.saving = false
      this.savingError = null
      try {
        const workflow = await workflowApi.getWorkflow(workflowId)
        if (requestId !== workflowLoadRequestCounter) {
          return false
        }

        const initialName = workflowId === 'new' ? options.initialName?.trim() : ''
        const nextWorkflowName = initialName || workflow.name
        const nextBackendDefinitionId = workflow.id === 'new'
          ? null
          : workflow.backendDefinitionId ?? getBackendDefinitionId(workflow.id) ?? null
        const nextNodes = structuredClone(workflow.nodes)
        const nextEdges = structuredClone(workflow.edges)

        // 加载期间仍可能保存旧画布，替换内容时必须一并失效这类请求。
        this.workflowSaveRequestSequence += 1
        this.saving = false
        this.workflowId = workflow.id
        this.workflowName = nextWorkflowName
        this.workflowDescription = workflow.description ?? ''
        this.createIdempotencyKey = null
        this.createIntent = null
        this.backendDefinitionId = nextBackendDefinitionId
        this.backendVersion = workflow.backendVersion ?? null
        this.projectId = workflow.projectId ?? null
        this.nodes = nextNodes
        this.edges = nextEdges
        this.historyPast = []
        this.historyFuture = []
        this.editRevision += 1
        this.dirty = Boolean(initialName)
        this.savingError = null
        this.runError = null
        return true
      } catch (error) {
        if (requestId !== workflowLoadRequestCounter) {
          return false
        }
        const details = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('workflow.loadFailedUnknown')
        this.loadingError = `${i18n.global.t('workflow.loadFailed')}: ${details}`
        return false
      } finally {
        if (requestId === workflowLoadRequestCounter) {
          this.loading = false
        }
      }
    },
    async saveCurrentWorkflow(options: { allowMockFallback?: boolean; projectId?: number } = {}) {
      const editRevisionAtStart = this.editRevision
      const loadRequestAtStart = workflowLoadRequestCounter
      const saveRequestId = ++this.workflowSaveRequestSequence
      // 导航代次隔离工作流，同代重叠保存由最新请求独占反馈与元数据写回。
      const ownsSaveState = () => loadRequestAtStart === workflowLoadRequestCounter
        && saveRequestId === this.workflowSaveRequestSequence
      this.saving = true
      this.savingError = null
      const recoveringCreation = !this.backendDefinitionId && Boolean(this.createIntent)
      try {
        const currentWorkflow: WorkflowDefinition = {
          id: this.workflowId,
          name: this.workflowName,
          description: this.workflowDescription,
          projectId: options.projectId ?? this.projectId ?? undefined,
          backendDefinitionId: this.backendDefinitionId ?? undefined,
          nodes: this.nodes,
          edges: this.edges,
          backendVersion: this.backendVersion ?? undefined,
        }
        if (!this.backendDefinitionId && !this.createIntent) {
          // 记录创建键首次提交的意图；相同键的响应不能确认之后修改过的内容。
          const workflow = structuredClone(unwrapWorkflowCloneValue(currentWorkflow)) as WorkflowDefinition
          this.createIdempotencyKey ??= crypto.randomUUID()
          this.createIntent = { workflow, editRevision: editRevisionAtStart }
        }
        const createIntent = !this.backendDefinitionId ? this.createIntent : null
        const savedRevision = createIntent?.editRevision ?? editRevisionAtStart
        const savedWorkflow = await workflowApi.saveWorkflow(
          // 允许修正被拒绝的定义；服务端若已落库则返回原记录，后面仍按首次 revision 保守确认。
          currentWorkflow,
          { ...options, idempotencyKey: this.createIdempotencyKey ?? undefined },
        )
        if (!ownsSaveState()) {
          return
        }
        this.workflowId = savedWorkflow.id
        if (this.editRevision === savedRevision) this.workflowName = savedWorkflow.name
        this.backendDefinitionId = savedWorkflow.backendDefinitionId ?? this.backendDefinitionId ?? null
        this.backendVersion = savedWorkflow.backendVersion ?? this.backendVersion ?? null
        if (this.backendDefinitionId) {
          this.createIdempotencyKey = null
          this.createIntent = null
        }
        this.projectId = savedWorkflow.projectId ?? this.projectId ?? null
        if (this.editRevision === savedRevision) {
          this.markSaved()
        } else {
          this.dirty = true
          if (recoveringCreation) {
            // 已恢复真实 ID，但新编辑尚未更新到服务端；阻止保存后直接启动或复制旧定义。
            throw new Error(i18n.global.t('workflow.createRecoveredPendingSave'))
          }
        }
        // 调用方只能为仍有效的成功保存执行页面收尾。
        return { workflowId: savedWorkflow.id }
      } catch (error) {
        if (ownsSaveState()) {
          const details = error instanceof Error && error.message
            ? error.message
            : i18n.global.t('workflow.saveFailedUnknown')
          this.savingError = `${i18n.global.t('workflow.saveFailed')}: ${details}`
        }
        throw error
      } finally {
        if (ownsSaveState()) {
          this.saving = false
        }
      }
    },
  },
})
