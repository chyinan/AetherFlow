// pattern: Mixed (needs refactoring)
import { defineStore } from 'pinia'
import { CUSTOM_NODE_STORAGE_KEY, customDefinitionKey, customNodeTemplate, exportCustomDefinitions, importCustomDefinitions, mergeCustomDefinitions, parseCustomDefinition, type CustomDefinition } from '@/utils/customNodes'
import { readCustomNodeLibrary, withCustomNodeWriteLock } from '@/utils/customNodeStorage'
import type { Connection } from '@vue-flow/core'
import { toRaw } from 'vue'

import { getWorkflowCapabilities } from '@/api/modules/ai'
import { getNodeCatalog, type WorkflowNodeCatalogItem } from '@/api/modules/node'
import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { toApiError } from '@/api/client/apiError'
import { i18n } from '@/i18n'
import { getBackendDefinitionId, workflowApi } from '@/services/api/workflowApi'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { isWorkflowCapabilitySnapshot } from '@/utils/capabilitySupport'
import type { CanvasPosition, NodeTemplate, WorkflowDefinition, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind, WorkflowNodeStatus } from '@/types/workflow'
import { createWorkflowNodeDataFromTemplate, duplicateWorkflowNode } from '@/utils/workflowNodeClone'
import { mergeWorkflowNodeConfig } from '@/utils/workflowNodeConfig'
import { reconcileNodeRuntimeState } from '@/utils/workflowNodeRuntime'
import { classifyRemoteSaveState, type SaveSubmissionSnapshot } from '@/utils/workflowSaveRecovery'
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

function serializeNodePositions(nodes: WorkflowGraphNode[]) {
  return JSON.stringify(nodes.map((node) => ({ id: node.id, position: node.position })))
}

function serializeEdgesWithoutSelection(edges: ReadonlyArray<WorkflowGraphEdge>) {
  return JSON.stringify(edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label ?? '' })))
}

/**
 * 只有“请求可能已经落库、但响应没有回来”的失败才需要核对远端。
 * 服务端明确拒绝（校验失败、版本冲突等 4xx）时结果是确定的，不要发起核对请求。
 */
function isUncertainSaveOutcome(error: unknown) {
  const apiError = toApiError(error, 'workflow')
  const status = apiError.status
  if (status === undefined) {
    return apiError.source === 'network'
  }
  if (status === 0 || status === 408 || status === 429) {
    return true
  }
  return status >= 500
}

type SaveWorkflowOptions = { allowMockFallback?: boolean; projectId?: number }

/**
 * 每个 Store 实例一条保存队列：所有保存入口（按钮保存、运行前保存、离开前保存）
 * 都排在同一个队尾，同一时刻最多一个 PUT 在途。重叠保存会让先到的回执被整体丢弃，
 * 版本基线停住，随后每次保存都带着旧版本撞 409。
 */
type WorkflowSaveQueue = {
  /** 队列所属的加载代次：换工作流后旧队列里的保存已被判定失效，不能阻塞新画布。 */
  generation: number
  tail: Promise<unknown>
  pending: number
}

const saveQueues = new WeakMap<object, WorkflowSaveQueue>()

function currentSaveQueue(owner: object): WorkflowSaveQueue {
  const existing = saveQueues.get(owner)
  if (existing && existing.generation === workflowLoadRequestCounter) return existing
  // 加载、替换、重置都会推进加载代次：新画布不能被已失效的旧保存堵住。
  const queue: WorkflowSaveQueue = { generation: workflowLoadRequestCounter, tail: Promise.resolve(), pending: 0 }
  saveQueues.set(owner, queue)
  return queue
}

/**
 * 迟到的成功回执不得覆盖当前页面状态，但它证明服务端版本已经前进：
 * 只把更大的版本号吸收为基线，否则下一次保存仍会带着旧版本冲突。
 */
function absorbLateSaveVersion(
  store: { workflowId: string; backendVersion: number | null },
  receipt: WorkflowDefinition,
  loadRequestAtStart: number,
) {
  if (loadRequestAtStart !== workflowLoadRequestCounter) return
  if (!receipt || typeof receipt.id !== 'string' || receipt.id !== store.workflowId) return
  const version = receipt.backendVersion
  if (typeof version !== 'number' || !Number.isFinite(version)) return
  if (typeof store.backendVersion === 'number' && version <= store.backendVersion) return
  store.backendVersion = version
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

/**
 * 生成当前图里没有被占用的 ID。
 * 冷重开后计数器会从头开始，直接使用会让新节点撞上已保存节点的 ID。
 */
function nextFreeId(prefix: string, usedIds: ReadonlySet<string>) {
  let id = `${prefix}-${nodeCounter++}`
  while (usedIds.has(id)) {
    id = `${prefix}-${nodeCounter++}`
  }
  return id
}

function createNodeFromTemplate(template: NodeTemplate, position: CanvasPosition, usedIds: ReadonlySet<string>): WorkflowGraphNode {
  return {
    id: nextFreeId(`node-${template.kind}`, usedIds),
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
  const branches = [source.data.config.trueBranch, source.data.config.falseBranch]
    .map((value, index) => typeof value === 'string' && value.trim() ? value.trim() : index === 0 ? 'true' : 'false')
  const used = new Set(outgoingLabels.map((label) => String(label ?? '').trim().toLowerCase()).filter(Boolean))
  const configuredBranchExists = branches.some((branch) => used.has(branch.toLowerCase()))
  if (configuredBranchExists) {
    return branches.find((branch) => !used.has(branch.toLowerCase()))
  }
  if (outgoingCount === 0) return branches[0]
  if (outgoingCount === 1) return branches[1]
  return undefined
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
    customDefinitions: [] as CustomDefinition[],
    customLibraryError: null as string | null,
    customLibrarySnapshot: null as string | null,
    customLibraryConflict: null as string | null,
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
    saveRecovery: null as null | {
      status: 'uncertain' | 'reconciling' | 'committed' | 'committedWithNewerEdits'
        | 'notSubmitted' | 'conflict' | 'retryable'
      workflowId: string
      message: string
    },
    /** 结果不确定、仍待核对的提交快照；跨保存保留，下一次保存前继续核对。 */
    pendingSaveSubmission: null as SaveSubmissionSnapshot | null,
    workflowSaveRequestSequence: 0,
    runError: null as string | null,
    historyPast: [] as WorkflowGraphHistoryEntry[],
    historyFuture: [] as WorkflowGraphHistoryEntry[],
    nodeDragSnapshot: null as WorkflowGraphHistoryEntry | null,
    historyLimit: 50,
  }),
  getters: {
    canUndo: (state) => state.historyPast.length > 0,
    canRedo: (state) => state.historyFuture.length > 0,
  },
  actions: {
    refreshCustomTemplates() {
      const builtin = this.templates.filter(template => !template.config.customDefinition)
      this.templates = [...builtin, ...this.customDefinitions.map(definition => customNodeTemplate(definition, builtin.find(template => template.kind === (definition.kind === 'API' ? 'http-request' : 'code'))))]
    },
    reloadCustomDefinitions() {
      try {
        const raw = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)
        this.customLibrarySnapshot = raw
        this.customDefinitions = readCustomNodeLibrary(raw).definitions
        this.customLibraryError = null
        this.customLibraryConflict = null
        this.refreshCustomTemplates()
      } catch (error) { this.customLibraryError = `本机模板库读取失败，原数据保留：${error instanceof Error ? error.message : String(error)}` }
    },
    async saveCustomDefinitions(definitions: CustomDefinition[], replaceCorrupted = false, signal?: AbortSignal) {
      if (this.customLibraryError && !replaceCorrupted) throw new Error('本机库读取失败；请先导出原数据，再使用已校验的模板包恢复')
      const serialized = exportCustomDefinitions(definitions)
      const validated = importCustomDefinitions(serialized)
      const expected = this.customLibrarySnapshot
      await withCustomNodeWriteLock(() => {
        const current = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)
        if (current !== expected) {
          this.reloadCustomDefinitions()
          this.customLibraryConflict = '模板库已被其他窗口更新，已同步最新列表；当前草稿未保存，请核对后重试。'
          throw new Error(this.customLibraryConflict)
        }
        let revision = 0
        let stored: ReturnType<typeof readCustomNodeLibrary> | undefined
        try { stored = readCustomNodeLibrary(current) }
        catch (error) { if (!replaceCorrupted || !this.customLibraryError) throw error }
        if (stored) {
          revision = stored.revision
          // 锁内再次校验同版本内容不可变；删除其他版本仍是显式的列表变更。
          mergeCustomDefinitions(stored.definitions, validated)
        }
        const next = JSON.stringify({ ...JSON.parse(serialized) as Record<string, unknown>, libraryRevision: revision + 1 })
        readCustomNodeLibrary(next)
        // 比较和写入之间不等待；存储失败时保留内存列表和调用方草稿。
        localStorage.setItem(CUSTOM_NODE_STORAGE_KEY, next)
        this.customDefinitions = validated
        this.customLibrarySnapshot = next
        this.customLibraryError = null
        this.customLibraryConflict = null
        this.refreshCustomTemplates()
      }, signal)
    },
    recordHistory() {
      this.historyPast = [...this.historyPast, cloneGraph(this.nodes, this.edges)].slice(-this.historyLimit)
      this.historyFuture = []
    },
    beginNodeDrag() {
      if (!this.nodeDragSnapshot) {
        this.nodeDragSnapshot = cloneGraph(this.nodes, this.edges)
      }
    },
    endNodeDrag() {
      const previous = this.nodeDragSnapshot
      this.nodeDragSnapshot = null
      if (!previous || serializeNodePositions(previous.nodes) === serializeNodePositions(this.nodes)) {
        return false
      }
      this.historyPast = [...this.historyPast, previous].slice(-this.historyLimit)
      this.historyFuture = []
      this.markDirty()
      return true
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
      this.reloadCustomDefinitions()
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
      // 替换画布会使旧代次中尚未发出的保存失效；在途 PUT 不可撤回，
      // 但它完成后不能再从旧队列读取这张新画布。
      saveQueues.delete(this)
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
    applyCopilotWorkflowDraft(request: CopilotWorkflowDraftApplyRequest, options: { allowUnavailableCustomDrafts?: boolean } = {}) {
      const baseMatches = this.workflowId === request.baseWorkflowId
        && this.editRevision === request.baseEditRevision
        && this.backendDefinitionId === request.baseDefinitionId
        && this.backendVersion === request.baseVersion
      const nodesAreAvailable = request.nodes.every((node) => {
        if (options.allowUnavailableCustomDrafts && node.data.config.customDefinition) {
          try {
            const definition = parseCustomDefinition(node.data.config.customDefinition)
            const previous = this.nodes.find((item) => item.id === node.id)
            if (previous?.data.kind === node.data.kind && previous.data.config.customDefinition) {
              const previousDefinition = parseCustomDefinition(previous.data.config.customDefinition)
              if (customDefinitionKey(previousDefinition) === customDefinitionKey(definition)) {
                // 现有节点持有独立快照；运行状态或本机库移除不阻止继续编辑。
                mergeCustomDefinitions([previousDefinition], [definition])
                return true
              }
            }
            const stored = this.customDefinitions.find((item) => customDefinitionKey(item) === customDefinitionKey(definition))
            if (!stored || node.data.kind !== (definition.kind === 'API' ? 'http-request' : 'code')) return false
            mergeCustomDefinitions([stored], [definition])
            // 仅接纳本机库中准确版本的未运行草稿；执行仍受运行时预检约束。
            return node.data.status === 'idle'
          } catch { return false }
        }
        const template = this.templates.find((item) => item.kind === node.data.kind && !item.config.customDefinition)
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
      // 草稿基于生成时的整图快照，确认期间可能已有新的运行事件写入画布。
      // 在最终提交点协调运行态：结构修改用草稿的，运行状态与运行摘要用当前画布最新的。
      this.nodes = reconcileNodeRuntimeState(graph.nodes, this.nodes)
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
      // 复制请求只创建副本；由页面确认请求仍有效后导航，不能提前覆盖当前编辑。
      return workflowApi.copyWorkflow(String(this.backendDefinitionId), name)
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
    /** 当前图已经占用的节点与连线 ID，新增节点和连线必须避开它们。 */
    usedGraphIds() {
      return new Set<string>([
        ...this.nodes.map((node) => node.id),
        ...this.edges.map((edge) => edge.id),
      ])
    },
    addNodeFromTemplate(template: NodeTemplate, position: CanvasPosition) {
      const unavailableReason = templateUnavailableReason(this.templates, template)
      if (unavailableReason) {
        this.runError = `${i18n.global.t('workflow.capabilityUnavailable')}：${unavailableReason}`
        return null
      }
      this.recordHistory()
      const node = createNodeFromTemplate(template, position, this.usedGraphIds())
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
      const node = createNodeFromTemplate(template, position, this.usedGraphIds())
      this.recordHistory()
      this.nodes.push(node)
      this.edges.push({
        id: nextFreeId('edge', this.usedGraphIds()),
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
        id: nextFreeId(`${source.id}-copy`, this.usedGraphIds()),
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
      saveQueues.delete(this)
      this.nodeDragSnapshot = null
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
      saveQueues.delete(this)
      this.nodeDragSnapshot = null
      this.loading = true
      this.loadingError = null
      // 导航开始即解除旧工作流的保存反馈，加载失败也不能留下旧的忙碌状态。
      this.saving = false
      this.savingError = null
      // 换了工作流就没有待核对的保存，旧的核对结果不得写进新页面。
      this.saveRecovery = null
      this.pendingSaveSubmission = null
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
    discardCurrentWorkflowSave() {
      // 丢弃离开会使尚未重放的旧提交失效；已发出的网络请求无法撤回。
      this.workflowSaveRequestSequence += 1
      saveQueues.delete(this)
      this.saving = false
      this.savingError = null
      this.saveRecovery = null
      this.pendingSaveSubmission = null
    },
    /**
     * 所有保存入口共用同一条队列：前一次保存结束后才发出下一次 PUT。
     * 排队期间保持 saving 反馈，队列排空后才解除。
     */
    async saveCurrentWorkflow(options: SaveWorkflowOptions = {}) {
      const generationAtEnqueue = workflowLoadRequestCounter
      const queue = currentSaveQueue(this)
      // 保存意图（尤其显式 projectId）属于本次调用，不能让调用方后续修改影响队列任务。
      const saveOptions = { ...options }
      queue.pending += 1
      this.saving = true
      this.savingError = null
      const stillOwnsQueuedCanvas = () => saveQueues.get(this) === queue
        && queue.generation === generationAtEnqueue
        && workflowLoadRequestCounter === generationAtEnqueue
      // 队列空闲时同步开始：调用瞬间的工作流身份、画布与编辑代次必须被立刻固定，
      // 不能被推后一拍让出给后续的替换/重置。
      const task = queue.pending === 1
        ? stillOwnsQueuedCanvas()
          ? this.performSaveCurrentWorkflow(queue, saveOptions)
          : Promise.resolve(undefined)
        : queue.tail.catch(() => undefined).then(() => (
          // 排队期间画布代次或队列所有权变化：不得在新画布上重读 definition/project。
          stillOwnsQueuedCanvas()
            ? this.performSaveCurrentWorkflow(queue, saveOptions)
            : undefined
        ))
      queue.tail = task.then(() => undefined, () => undefined)
      try {
        return await task
      } finally {
        queue.pending -= 1
        // 同一代次队列排空才解除忙碌；换工作流后由新的队列决定页面反馈。
        if (saveQueues.get(this) === queue && queue.pending === 0) this.saving = false
      }
    },
    async performSaveCurrentWorkflow(queue: WorkflowSaveQueue, options: SaveWorkflowOptions = {}) {
      const editRevisionAtStart = this.editRevision
      const loadRequestAtStart = workflowLoadRequestCounter
      const saveRequestId = ++this.workflowSaveRequestSequence
      // 导航代次隔离工作流，同代重叠保存由最新请求独占反馈与元数据写回。
      const ownsSaveState = () => loadRequestAtStart === workflowLoadRequestCounter
        && saveRequestId === this.workflowSaveRequestSequence
      this.saving = true
      this.savingError = null
      this.saveRecovery = null
      const recoveringCreation = !this.backendDefinitionId && Boolean(this.createIntent)
      // 提交快照在发出前固定，核对时用它判断远端是否真的落库了这次内容。
      let submission: SaveSubmissionSnapshot | null = null
      try {
        // 上一次保存的结果仍不确定时先核对远端：确认已落库就更新基线，
        // 否则下一次保存会一直带着旧版本重复冲突。
        if (this.pendingSaveSubmission) {
          const alreadySaved = await this.reconcilePendingSave(ownsSaveState)
          if (!ownsSaveState()) {
            return
          }
          if (alreadySaved) return { workflowId: this.workflowId }
        }
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
        // 提交快照在发出前固定，核对时用它判断远端是否真的落库了这次内容。
        submission = this.captureSaveSubmission(currentWorkflow)
        const saveRequestWorkflow = structuredClone(unwrapWorkflowCloneValue(currentWorkflow)) as WorkflowDefinition
        if (!this.backendDefinitionId && !this.createIntent) {
          // 记录创建键首次提交的意图；相同键的响应不能确认之后修改过的内容。
          this.createIdempotencyKey ??= crypto.randomUUID()
          this.createIntent = { workflow: saveRequestWorkflow, editRevision: editRevisionAtStart }
        }
        const createIntent = !this.backendDefinitionId ? this.createIntent : null
        const savedRevision = createIntent?.editRevision ?? editRevisionAtStart
        const savedWorkflow = await workflowApi.saveWorkflow(
          // 允许修正被拒绝的定义；服务端若已落库则返回原记录，后面仍按首次 revision 保守确认。
          saveRequestWorkflow,
          { ...options, idempotencyKey: this.createIdempotencyKey ?? undefined },
        )
        if (!ownsSaveState()) {
          // 迟到回执不覆盖当前页面，但它证明服务端版本已前进：只吸收版本基线。
          absorbLateSaveVersion(this, savedWorkflow, loadRequestAtStart)
          return
        }
        this.workflowId = savedWorkflow.id
        if (this.editRevision === savedRevision) this.workflowName = savedWorkflow.name
        this.backendDefinitionId = savedWorkflow.backendDefinitionId ?? this.backendDefinitionId ?? null
        this.backendVersion = savedWorkflow.backendVersion ?? this.backendVersion ?? null
        // 保存成功说明基线已经前进，之前的待核对提交不再适用。
        this.pendingSaveSubmission = null
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
        if (!ownsSaveState()) {
          throw error
        }
        if (!isUncertainSaveOutcome(error)) {
          const apiError = toApiError(error, 'workflow')
          // 版本冲突是确定失败，但基线可以只读刷新：否则之后每次保存都会带着旧版本继续 409。
          if (apiError.status === 409) {
            await this.refreshSaveBaselineAfterConflict(ownsSaveState)
          }
          const details = apiError.message || i18n.global.t('workflow.saveFailedUnknown')
          this.savingError = `${i18n.global.t('workflow.saveFailed')}: ${details}`
          throw error
        }
        // 响应丢失：结果不确定。只读核对远端，绝不用重载覆盖当前画布或草稿。
        this.pendingSaveSubmission = submission
        this.saveRecovery = {
          status: 'uncertain',
          workflowId: submission?.workflowId ?? this.workflowId,
          message: i18n.global.t('workflow.saveRecoveryUncertain'),
        }
        const recovered = await this.reconcileUncertainSave(submission, ownsSaveState, error)
        if (!ownsSaveState()) {
          throw error
        }
        if (recovered.status === 'committed' || recovered.status === 'committedWithNewerEdits'
          || recovered.status === 'notSubmitted') {
          this.pendingSaveSubmission = null
        }
        if (recovered.status === 'committed' || recovered.status === 'committedWithNewerEdits') {
          return { workflowId: this.workflowId }
        }
        this.savingError = recovered.message
        throw new Error(recovered.message)
      } finally {
        // 队列里还有排队的保存时保持忙碌反馈，等队列排空统一解除。
        if (ownsSaveState() && queue.pending <= 1) {
          this.saving = false
        }
      }
    },
    /**
     * 版本冲突后只读刷新保存基线：只推进本端 backendVersion。
     * 不重载画布、不清空草稿、不用远端内容覆盖本地编辑。
     */
    async refreshSaveBaselineAfterConflict(ownsSaveState: () => boolean): Promise<boolean> {
      const definitionId = this.backendDefinitionId
      const workflowId = this.workflowId
      if (typeof definitionId !== 'number') return false
      try {
        const remote = await workflowApi.readWorkflowDefinition(definitionId)
        if (!ownsSaveState() || this.workflowId !== workflowId || this.backendDefinitionId !== definitionId) return false
        const version = typeof remote?.version === 'number' && Number.isFinite(remote.version) ? remote.version : undefined
        if (version === undefined) return false
        if (typeof this.backendVersion !== 'number' || version > this.backendVersion) {
          this.backendVersion = version
        }
        return true
      } catch {
        // 只读刷新失败不影响本地草稿；下一次保存会再刷新一次基线。
        return false
      }
    },
    captureSaveSubmission(currentWorkflow: WorkflowDefinition): SaveSubmissionSnapshot | null {
      if (!this.backendDefinitionId || typeof this.backendVersion !== 'number') {
        // 首次创建没有可核对的远端版本，沿用既有幂等键恢复路径。
        return null
      }
      return {
        workflowId: currentWorkflow.id,
        definitionId: this.backendDefinitionId,
        expectedVersion: this.backendVersion,
        editRevision: this.editRevision,
        payload: JSON.parse(JSON.stringify(mapWorkflowToDefinitionDTO(currentWorkflow))) as WorkflowDefinitionDTO,
        workflow: structuredClone(unwrapWorkflowCloneValue(currentWorkflow)) as WorkflowDefinition,
      }
    },
    /**
     * 上一次保存的结果仍不确定时先核对远端：确认已落库就更新基线，
     * 否则下一次保存会一直带着旧版本重复冲突。核对失败时保留待核对提交，下次继续。
     */
    async reconcilePendingSave(ownsSaveState: () => boolean): Promise<boolean> {
      const pending = this.pendingSaveSubmission
      if (!pending) return false
      if (!ownsSaveState()) return false
      if (pending.workflowId !== this.workflowId) {
        this.pendingSaveSubmission = null
        return false
      }
      const recovered = await this.reconcileUncertainSave(pending, ownsSaveState)
      // 核对期间用户可能已丢弃并离开；旧 GET 失败后不能再发出旧快照的 PUT。
      if (!ownsSaveState() || this.workflowId !== pending.workflowId) return false
      if (recovered.status === 'conflict') {
        // 真正的远端冲突不能靠再次提交解决，也不能覆盖远端。
        throw new Error(recovered.message)
      }
      if (recovered.status === 'committed' || recovered.status === 'committedWithNewerEdits') {
        this.pendingSaveSubmission = null
        return recovered.status === 'committed' && this.editRevision === pending.editRevision
      }
      if (recovered.status === 'retryable') {
        // 一次仍读到旧版本的 GET 不能证明在途 PUT 以后不会提交。
        // 先用相同版本和相同内容重放 A，确认后才允许保存新的本地草稿。
        const retried = await this.retryPendingSaveSubmission(pending, ownsSaveState)
        if (retried.status === 'conflict') throw new Error(retried.message)
        if (retried.status === 'retryable') throw new Error(retried.message)
        if (retried.status === 'notSubmitted') {
          this.pendingSaveSubmission = null
          return false
        }
        this.pendingSaveSubmission = null
        return retried.status === 'committed' && this.editRevision === pending.editRevision
      }
      return false
    },
    async reconcileUncertainSave(
      submission: SaveSubmissionSnapshot | null,
      ownsSaveState: () => boolean,
      cause?: unknown,
    ): Promise<{ status: 'committed' | 'committedWithNewerEdits' | 'notSubmitted' | 'conflict' | 'retryable'; message: string }> {
      const details = cause === undefined ? '' : toApiError(cause, 'workflow').message
      if (!submission) {
        // 首次创建没有可核对的远端版本，沿用既有幂等键恢复路径：重试会拿回原记录。
        const message = `${i18n.global.t('workflow.saveRecoveryUnknown')}${details ? `: ${details}` : ''}`
        this.saveRecovery = { status: 'retryable', workflowId: this.workflowId, message }
        return { status: 'retryable', message }
      }
      this.saveRecovery = {
        status: 'reconciling',
        workflowId: submission.workflowId,
        message: i18n.global.t('workflow.saveRecoveryReconciling'),
      }
      let remote: { version?: number; definitionJson?: string }
      try {
        remote = await workflowApi.readWorkflowDefinition(submission.definitionId!)
      } catch (error) {
        const message = `${i18n.global.t('workflow.saveRecoveryRetryable')}: ${toApiError(error, 'workflow').message}`
        if (ownsSaveState() && this.workflowId === submission.workflowId) {
          this.saveRecovery = { status: 'retryable', workflowId: submission.workflowId, message }
        }
        return { status: 'retryable', message }
      }
      // 迟到结果不得写回：期间可能已切页、重载或出现新的保存。
      if (!ownsSaveState() || this.workflowId !== submission.workflowId) {
        return { status: 'conflict', message: i18n.global.t('workflow.saveRecoveryStale') }
      }
      const state = classifyRemoteSaveState(submission, remote)
      if (state === 'committed') {
        this.backendVersion = remote.version ?? this.backendVersion
        if (this.editRevision === submission.editRevision) {
          this.markSaved()
          const message = i18n.global.t('workflow.saveRecoveryCommitted')
          this.saveRecovery = { status: 'committed', workflowId: submission.workflowId, message }
          return { status: 'committed', message }
        }
        // 存在较新的本地编辑：保留草稿、选中状态与撤销重做历史，只更新保存基线。
        const message = i18n.global.t('workflow.saveRecoveryCommittedWithNewerEdits')
        this.saveRecovery = { status: 'committedWithNewerEdits', workflowId: submission.workflowId, message }
        return { status: 'committedWithNewerEdits', message }
      }
      if (state === 'notSubmitted') {
        // GET 只描述读取时刻；原 PUT 仍可能在这次读取之后完成。
        const message = `${i18n.global.t('workflow.saveRecoveryRetryable')}${details ? `: ${details}` : ''}`
        this.saveRecovery = { status: 'retryable', workflowId: submission.workflowId, message }
        return { status: 'retryable', message }
      }
      const message = `${i18n.global.t('workflow.saveRecoveryConflict')}${details ? `: ${details}` : ''}`
      this.saveRecovery = { status: 'conflict', workflowId: submission.workflowId, message }
      return { status: 'conflict', message }
    },
    async retryPendingSaveSubmission(
      submission: SaveSubmissionSnapshot,
      ownsSaveState: () => boolean,
    ): Promise<{ status: 'committed' | 'committedWithNewerEdits' | 'notSubmitted' | 'conflict' | 'retryable'; message: string }> {
      if (!ownsSaveState() || this.workflowId !== submission.workflowId) {
        return { status: 'conflict', message: i18n.global.t('workflow.saveRecoveryStale') }
      }
      if (!submission.workflow || typeof submission.expectedVersion !== 'number') {
        const message = i18n.global.t('workflow.saveRecoveryRetryable')
        this.saveRecovery = { status: 'retryable', workflowId: submission.workflowId, message }
        return { status: 'retryable', message }
      }
      try {
        const savedWorkflow = await workflowApi.saveWorkflow(submission.workflow, { allowMockFallback: false })
        if (!ownsSaveState() || this.workflowId !== submission.workflowId) {
          return { status: 'conflict', message: i18n.global.t('workflow.saveRecoveryStale') }
        }
        if (savedWorkflow.id !== submission.workflowId
          || savedWorkflow.backendVersion !== submission.expectedVersion + 1) {
          return this.reconcileUncertainSave(submission, ownsSaveState)
        }
        this.backendDefinitionId = savedWorkflow.backendDefinitionId ?? submission.definitionId ?? null
        this.backendVersion = savedWorkflow.backendVersion
        this.projectId = savedWorkflow.projectId ?? this.projectId
        if (this.editRevision === submission.editRevision) {
          this.markSaved()
          const message = i18n.global.t('workflow.saveRecoveryCommitted')
          this.saveRecovery = { status: 'committed', workflowId: submission.workflowId, message }
          return { status: 'committed', message }
        }
        // 重放 A 只更新远端基线；较新的画布和撤销重做历史继续保留。
        this.dirty = true
        const message = i18n.global.t('workflow.saveRecoveryCommittedWithNewerEdits')
        this.saveRecovery = { status: 'committedWithNewerEdits', workflowId: submission.workflowId, message }
        return { status: 'committedWithNewerEdits', message }
      } catch (error) {
        if (!ownsSaveState() || this.workflowId !== submission.workflowId) {
          return { status: 'conflict', message: i18n.global.t('workflow.saveRecoveryStale') }
        }
        const apiError = toApiError(error, 'workflow')
        if (apiError.status === 409) {
          return this.reconcileUncertainSave(submission, ownsSaveState, error)
        }
        if ([400, 422].includes(apiError.status ?? 0)) {
          const details = apiError.message || i18n.global.t('workflow.saveFailedUnknown')
          const message = `${i18n.global.t('workflow.saveRecoveryNotSubmitted')}: ${details}`
          this.saveRecovery = { status: 'notSubmitted', workflowId: submission.workflowId, message }
          return { status: 'notSubmitted', message }
        }
        const message = `${i18n.global.t('workflow.saveRecoveryRetryable')}: ${apiError.message}`
        this.saveRecovery = { status: 'retryable', workflowId: submission.workflowId, message }
        return { status: 'retryable', message }
      }
    },
  },
})
