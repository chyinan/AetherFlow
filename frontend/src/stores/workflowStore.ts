// pattern: Mixed (needs refactoring)
import { defineStore } from 'pinia'
import type { Connection } from '@vue-flow/core'

import { getNodeCatalog, type WorkflowNodeCatalogItem } from '@/api/modules/node'
import { i18n } from '@/i18n'
import { buildMediaSummaryDraftGraph } from '@/services/copilot/workflowCopilotActions'
import { getBackendDefinitionId, workflowApi } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { CanvasPosition, NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind, WorkflowNodeStatus } from '@/types/workflow'
import { duplicateWorkflowNode } from '@/utils/workflowNodeClone'
import { findDuplicateNodePosition } from '@/utils/workflowNodePlacement'

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
  UPLOAD: 'ffmpeg',
  WHISPER: 'whisper',
  LLM: 'llm',
  TRANSLATE: 'translate',
  SUMMARY: 'summary',
  OCR: 'document-extractor',
  EMBEDDING: 'embedding',
  KNOWLEDGE_RETRIEVAL: 'knowledge-retrieval',
  EXPORT: 'export',
  END: 'output',
  AGENT: 'agent',
  QUESTION_UNDERSTAND: 'question-understand',
  QUESTION_CLASSIFIER: 'question-classifier',
  CONDITION: 'condition',
  HUMAN: 'human',
  ITERATION: 'iteration',
  LOOP: 'loop',
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
  Utility: 'Tool',
}

const RECOMMENDED_BACKEND_TYPES = new Set([
  'START',
  'UPLOAD',
  'URL_FETCH',
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
    data: {
      ...template,
      status: 'idle',
      runtime: { lastResult: i18n.global.t('workflow.mockResults.newNode') },
    },
  }
}

function branchLabelForConnection(source: Readonly<WorkflowGraphNode>, outgoingCount: number) {
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

function templateFromCatalogItem(item: WorkflowNodeCatalogItem): NodeTemplate | null {
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
    config: {
      ...(fallback?.config ?? {}),
      ...(item.exampleConfig ?? {}),
    },
    inputs: variableNames(item.inputVariables).length > 0 ? variableNames(item.inputVariables) : fallback?.inputs ?? [],
    outputs: variableNames(item.outputVariables).length > 0 ? variableNames(item.outputVariables) : fallback?.outputs ?? [],
  }
}

function mergeTemplates(fallbackTemplates: NodeTemplate[], catalogTemplates: NodeTemplate[]) {
  const templatesByKind = new Map<WorkflowNodeKind, NodeTemplate>()
  fallbackTemplates.forEach((template) => templatesByKind.set(template.kind, template))
  catalogTemplates.forEach((template) => templatesByKind.set(template.kind, template))
  return Array.from(templatesByKind.values())
}

export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    workflowId: 'new',
    workflowName: 'Untitled Workflow',
    backendDefinitionId: null as number | null,
    templates: nodeTemplates,
    nodes: cloneNodes(),
    edges: cloneEdges(),
    dirty: false,
    editRevision: 0,
    loading: false,
    loadingError: null as string | null,
    saving: false,
    savingError: null as string | null,
    runError: null as string | null,
  }),
  actions: {
    markDirty() {
      this.editRevision += 1
      this.dirty = true
      this.savingError = null
      this.runError = null
    },
    setRunError(message: string | null) {
      this.runError = message
    },
    async loadNodeTemplates() {
      try {
        const catalog = await getNodeCatalog()
        const catalogTemplates = catalog
          .map(templateFromCatalogItem)
          .filter((template): template is NodeTemplate => template !== null)
        if (catalogTemplates.length > 0) {
          this.templates = mergeTemplates(nodeTemplates, catalogTemplates)
        }
      } catch {
        this.templates = nodeTemplates
      }
    },
    setNodes(nodes: WorkflowGraphNode[]) {
      const changed = serializeNodesWithoutSelection(nodes) !== serializeNodesWithoutSelection(this.nodes)
      this.nodes = nodes
      if (changed) {
        this.markDirty()
      }
    },
    setEdges(edges: WorkflowGraphEdge[]) {
      this.edges = edges
      this.markDirty()
    },
    addConnection(connection: Connection) {
      if (!connection.source || !connection.target) {
        return
      }
      const source = this.nodes.find((node) => node.id === connection.source)
      const outgoingCount = this.edges.filter((edge) => edge.source === connection.source).length
      this.edges.push({
        ...connection,
        id: `edge-${edgeCounter++}`,
        animated: true,
        label: source ? branchLabelForConnection(source, outgoingCount) : undefined,
      })
      this.markDirty()
    },
    addNodeFromTemplate(template: NodeTemplate, position: CanvasPosition) {
      const node = createNodeFromTemplate(template, position)
      this.nodes.push(node)
      this.markDirty()
      return node
    },
    addNodeAfter(sourceNodeId: string, template: NodeTemplate) {
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
      this.nodes.push(node)
      this.edges.push({
        id: `edge-${edgeCounter++}`,
        source: source.id,
        target: node.id,
        animated: true,
        label: branchLabelForConnection(source, outgoingCount),
      })
      this.markDirty()
      return node
    },
    applyMediaSummaryWorkflowDraft() {
      const maxX = this.nodes.reduce((value, node) => Math.max(value, node.position.x), 0)
      const graph = buildMediaSummaryDraftGraph(this.templates, {
        idPrefix: `copilot-media-${Date.now()}`,
        startPosition: {
          x: this.nodes.length === 0 ? 80 : maxX + 360,
          y: this.nodes.length === 0 ? 180 : 140,
        },
      })
      this.nodes.push(...graph.nodes)
      this.edges.push(...graph.edges)
      this.markDirty()
      return graph
    },
    duplicateNode(nodeId: string) {
      const source = this.nodes.find((node) => node.id === nodeId)
      if (!source) {
        return null
      }
      const node = duplicateWorkflowNode(source, {
        id: `${source.id}-copy-${nodeCounter++}`,
        position: findDuplicateNodePosition(source, this.nodes),
        lastResult: i18n.global.t('workflow.mockResults.newNode'),
      })
      this.nodes.push(node)
      this.markDirty()
      return node
    },
    deleteNode(nodeId: string) {
      const beforeLength = this.nodes.length
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
      const node = this.nodes.find((item) => item.id === nodeId)
      if (node) {
        node.data.config[key] = value
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
      this.backendDefinitionId = null
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.editRevision += 1
      this.dirty = false
      this.loading = false
      this.loadingError = null
      this.savingError = null
      this.runError = null
    },
    clearCurrentWorkflow() {
      this.nodes = cloneNodes()
      this.edges = cloneEdges()
      this.markDirty()
    },
    markSaved() {
      this.dirty = false
      this.savingError = null
      this.runError = null
    },
    async loadWorkflow(workflowId: string, options: { initialName?: string } = {}): Promise<boolean> {
      const requestId = ++workflowLoadRequestCounter
      this.loading = true
      this.loadingError = null
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

        this.workflowId = workflow.id
        this.workflowName = nextWorkflowName
        this.backendDefinitionId = nextBackendDefinitionId
        this.nodes = nextNodes
        this.edges = nextEdges
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
    async saveCurrentWorkflow(options: { allowMockFallback?: boolean } = {}) {
      const editRevisionAtStart = this.editRevision
      const loadRequestAtStart = workflowLoadRequestCounter
      this.saving = true
      this.savingError = null
      try {
        const savedWorkflow = await workflowApi.saveWorkflow({
          id: this.workflowId,
          name: this.workflowName,
          backendDefinitionId: this.backendDefinitionId ?? undefined,
          nodes: this.nodes,
          edges: this.edges,
        }, options)
        if (loadRequestAtStart !== workflowLoadRequestCounter) {
          return
        }
        this.workflowId = savedWorkflow.id
        this.workflowName = savedWorkflow.name
        this.backendDefinitionId = savedWorkflow.backendDefinitionId ?? this.backendDefinitionId ?? null
        if (this.editRevision === editRevisionAtStart) {
          this.markSaved()
        }
      } catch (error) {
        const details = error instanceof Error && error.message
          ? error.message
          : i18n.global.t('workflow.saveFailedUnknown')
        this.savingError = `${i18n.global.t('workflow.saveFailed')}: ${details}`
        throw error
      } finally {
        this.saving = false
      }
    },
  },
})
