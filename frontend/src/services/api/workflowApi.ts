// pattern: Mixed (needs refactoring)
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import {
  createDefinition,
  cancelWorkflowInstance,
  copyDefinition as copyWorkflowDefinition,
  deleteDefinition,
  getDefinition,
  listDefinitions,
  listWorkflowTemplates as fetchWorkflowTemplates,
  startInstance,
  updateDefinition,
  type WorkflowDefinitionEntity,
} from '@/api/modules/workflow'

export { cancelWorkflowInstance }
import { useAuthStore } from '@/stores/authStore'
import type { WorkflowDefinition, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind, WorkflowSummary } from '@/types/workflow'
import { formatDateTime as formatLocaleDateTime } from '@/utils/localeFormat'

const DEFINITION_LINKS_STORAGE_KEY = 'aetherflow.workflow.backendDefinitionLinks'
const RUN_LINKS_STORAGE_KEY = 'aetherflow.workflow.backendRunLinks'

export interface StartedRunLink {
  runId: string
  workflowId: string
  backendInstanceId?: number
  runtimeWorkflowId?: string
  definitionId?: number
  backendStatus?: string
}

export type WorkflowRunInput = Record<string, unknown>

interface RealBackendOptions {
  allowMockFallback?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readStorageRecord<T>(key: string): Record<string, T> {
  try {
    if (typeof localStorage === 'undefined') {
      return {}
    }

    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown
    return isRecord(parsed) ? parsed as Record<string, T> : {}
  } catch {
    return {}
  }
}

function writeStorageRecord<T>(key: string, value: Record<string, T>) {
  try {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Backend success must not be reported as a frontend failure because storage is blocked.
  }
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function numericIdFromWorkflowId(workflowId: string) {
  const match = workflowId.match(/^(?:definition-|workflow-|wf-)?(\d+)$/)
  const parsed = match ? Number(match[1]) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function definitionIdCandidates(workflowId: string) {
  const numericId = numericIdFromWorkflowId(workflowId)
  const linkedId = getBackendDefinitionId(workflowId)

  return [
    numericId,
    linkedId,
  ].filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
    .filter((id, index, ids) => ids.indexOf(id) === index)
}

function normalizeBackendStatus(status: unknown): WorkflowSummary['status'] {
  const normalized = String(status ?? '').trim().toUpperCase()
  if (normalized === 'RUNNING') {
    return 'running'
  }
  if (normalized === 'DRAFT') {
    return 'draft'
  }
  return 'ready'
}

function formatDateTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return formatLocaleDateTime(date)
}

interface BackendWorkflowNode {
  nodeId?: string
  nodeType?: string
  displayName?: string
  position?: { x?: number; y?: number }
  config?: Record<string, unknown>
}

type BackendWorkflowConnection = {
  target: string
  label?: string
}

const NODE_KIND_BY_BACKEND_TYPE: Record<string, WorkflowNodeKind> = {
  START: 'start',
  PROMPT: 'prompt',
  IMAGE_GENERATION: 'image-generation',
  UPSCALE: 'upscale',
  SAVE_IMAGE: 'save-image',
  URL_FETCH: 'url-fetch',
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
  CODE: 'code',
  TEMPLATE_TRANSFORM: 'template-transform',
  VARIABLE_AGGREGATE: 'variable-aggregate',
  VARIABLE_ASSIGNER: 'variable-assigner',
  PARAMETER_EXTRACTOR: 'parameter-extractor',
}

const NODE_COPY_BY_KIND: Record<string, { label: string; description: string; inputs: string[]; outputs: string[] }> = {
  start: {
    label: '输入视频文件',
    description: '工作流入口，运行时需要选择一个视频文件并注入 fileId。',
    inputs: [],
    outputs: ['fileId'],
  },
  prompt: {
    label: 'Prompt Variables',
    description: 'Prepare prompt variables for downstream image generation; this node does not generate images.',
    inputs: [],
    outputs: ['prompt', 'negativePrompt', 'promptMetadata'],
  },
  'image-generation': {
    label: 'Image Generation',
    description: 'Run SD WebUI or ComfyUI generation with model, sampler, LoRA, and workflow parameters.',
    inputs: ['prompt', 'negativePrompt', 'sourceImage'],
    outputs: ['imageFiles', 'imageFileIds', 'imageUrls'],
  },
  upscale: {
    label: 'Upscale',
    description: 'Upscale an image and store the result.',
    inputs: ['sourceImage'],
    outputs: ['upscaledImageFiles', 'upscaledImageFileIds', 'upscaledImageUrls'],
  },
  'save-image': {
    label: 'Save Image',
    description: 'Store image payloads and expose file metadata.',
    inputs: ['images'],
    outputs: ['savedImageFiles', 'savedImageFileIds', 'savedImageUrls'],
  },
  'url-fetch': {
    label: 'URL Fetch',
    description: 'Fetch a public web page and expose cleaned text for downstream nodes.',
    inputs: ['websiteUrl'],
    outputs: ['urlText', 'urlTitle', 'urlSourceUrl', 'urlCharCount'],
  },
  upload: {
    label: '读取视频文件',
    description: '从文件服务读取上传视频元数据，向后续真实运行节点传递 fileUrl。',
    inputs: ['fileId'],
    outputs: ['fileUrl', 'fileObjectKey', 'fileSize'],
  },
  ffmpeg: {
    label: 'FFmpeg Media Transform',
    description: 'Extract audio or convert media through the real FFmpeg runtime.',
    inputs: ['fileUrl'],
    outputs: ['mediaFileName', 'mediaContentType', 'mediaSize', 'mediaFileId', 'mediaUrl', 'mediaObjectKey', 'fileId', 'fileUrl', 'fileObjectKey'],
  },
  whisper: {
    label: 'FFmpeg 分离音频 / Whisper 提取文本',
    description: 'Python AI Runtime 使用 FFmpeg 抽取音频，并通过 faster-whisper 生成转写文本。',
    inputs: ['fileUrl'],
    outputs: ['transcription', 'srtObjectKey', 'durationSeconds'],
  },
  summary: {
    label: 'LLM 总结',
    description: '调用已配置的 LLM 提供商生成会议纪要、决策和行动项。',
    inputs: ['transcription'],
    outputs: ['summary'],
  },
  condition: {
    label: '条件分支',
    description: '计算一条条件，并将匹配结果映射为稳定的真假分支键。',
    inputs: ['variable'],
    outputs: ['matched', 'branchKey'],
  },
  code: {
    label: '代码执行',
    description: '保存代码配置；只有接入独立隔离执行器后才能运行。',
    inputs: ['payload'],
    outputs: ['codeResult'],
  },
  'template-transform': {
    label: '模板转换',
    description: '使用工作流上下文变量渲染 {{ variable }} 模板。',
    inputs: ['variables'],
    outputs: ['renderedText'],
  },
  embedding: {
    label: 'Embedding',
    description: 'Split text, generate embeddings, and write vector records.',
    inputs: ['ocrText', 'urlText', 'summary'],
    outputs: ['embeddingResults', 'embeddingVectorCount', 'embeddingVectorStore'],
  },
  'knowledge-retrieval': {
    label: 'Knowledge Retrieval',
    description: 'Retrieve top-k chunks from a knowledge dataset.',
    inputs: ['question'],
    outputs: ['retrievalContext', 'retrievalResults', 'retrievalCount'],
  },
  export: {
    label: '输出文档',
    description: '将 summary 写入 Markdown 文档并登记到文件服务。',
    inputs: ['summary'],
    outputs: ['exportFileUrl', 'exportObjectKey', 'exportFileId'],
  },
  output: {
    label: '完成',
    description: '结束工作流并返回文档产物。',
    inputs: ['exportFileUrl'],
    outputs: ['output'],
  },
}

const GRAPH_CONFIG_KEYS = new Set(['next', 'nextNodes', 'branches', 'defaultNext'])

function isBackendWorkflowNode(value: unknown): value is BackendWorkflowNode {
  return isRecord(value) && typeof value.nodeId === 'string' && typeof value.nodeType === 'string'
}

function isFrontendWorkflowNode(value: unknown): value is WorkflowGraphNode {
  if (!isRecord(value) || typeof value.id !== 'string' || value.type !== 'workflow') {
    return false
  }
  if (!isRecord(value.position) || typeof value.position.x !== 'number' || typeof value.position.y !== 'number') {
    return false
  }
  if (!isRecord(value.data)) {
    return false
  }
  return typeof value.data.kind === 'string'
    && isRecord(value.data.config)
    && Array.isArray(value.data.inputs)
    && Array.isArray(value.data.outputs)
    && typeof value.data.status === 'string'
}

function isFrontendWorkflowEdge(value: unknown): value is WorkflowGraphEdge {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.source === 'string'
    && typeof value.target === 'string'
}

function toFrontendNodeConfig(config: Record<string, unknown> = {}, kind?: WorkflowNodeKind) {
  const frontendConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => !GRAPH_CONFIG_KEYS.has(key)),
  ) as WorkflowGraphNode['data']['config']

  if (kind === 'output' && !('outputName' in frontendConfig) && !('outputValue' in frontendConfig) && isRecord(config.output)) {
    const firstOutput = Object.entries(config.output)[0]
    if (firstOutput) {
      frontendConfig.outputName = firstOutput[0]
      frontendConfig.outputValue = firstOutput[1]
    }
  }

  if (kind === 'knowledge-retrieval') {
    if (!('datasetId' in frontendConfig) && 'dataset' in config) {
      frontendConfig.datasetId = config.dataset
    }
    if (!('queryVariable' in frontendConfig) && 'query' in config) {
      frontendConfig.queryVariable = config.query
    }
    delete frontendConfig.dataset
    delete frontendConfig.query
  }

  if (kind === 'question-classifier' && Array.isArray(frontendConfig.routes)) {
    const routes = frontendConfig.routes.filter(
      (route): route is string => typeof route === 'string' && route.trim() !== '',
    )
    if (!('class1' in frontendConfig) && routes[0]) {
      frontendConfig.class1 = routes[0]
    }
    if (!('class2' in frontendConfig) && routes[1]) {
      frontendConfig.class2 = routes[1]
    }
  }

  if (kind === 'start' && !('fileId' in frontendConfig) && isRecord(frontendConfig.variables)) {
    const fileId = frontendConfig.variables.fileId
    if ((typeof fileId === 'number' && Number.isFinite(fileId))
      || (typeof fileId === 'string' && fileId.trim() !== '')) {
      frontendConfig.fileId = fileId
    }
  }

  return frontendConfig
}

function backendTargets(config: Record<string, unknown> = {}) {
  const targets: string[] = []
  const nextNodes = config.nextNodes
  if (Array.isArray(nextNodes)) {
    nextNodes.forEach((target) => {
      if (typeof target === 'string' && target.trim()) {
        targets.push(target.trim())
      }
    })
  }
  if (typeof config.next === 'string' && config.next.trim()) {
    targets.push(config.next.trim())
  }
  if (typeof config.defaultNext === 'string' && config.defaultNext.trim()) {
    targets.push(config.defaultNext.trim())
  }
  return [...new Set(targets)]
}

function backendConnections(config: Record<string, unknown> = {}): Array<BackendWorkflowConnection> {
  const branchConnections = isRecord(config.branches)
    ? Object.entries(config.branches)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))
        .map(([label, target]) => ({ label, target: target.trim() }))
    : []
  const branchTargets = new Set(branchConnections.map((connection) => connection.target))
  const sequentialConnections = backendTargets(config)
    .filter((target) => !branchTargets.has(target))
    .map((target) => ({ target }))
  return [...branchConnections, ...sequentialConnections]
}

function persistedNodePosition(value: unknown, index: number) {
  if (isRecord(value)) {
    const x = Number(value.x)
    const y = Number(value.y)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y }
    }
  }

  return {
    x: 80 + index * 310,
    y: index % 2 === 0 ? 170 : 110,
  }
}

export function mapBackendDefinitionGraph(nodes: BackendWorkflowNode[]) {
  const nodeIds = new Set(nodes.map((node) => node.nodeId).filter(Boolean))
  const graphNodes = nodes.map<WorkflowGraphNode>((node, index) => {
    const nodeType = stringOr(node.nodeType, '').toUpperCase()
    const kind = NODE_KIND_BY_BACKEND_TYPE[nodeType]
    if (!kind) {
      throw new Error(`unsupported workflow node type: ${nodeType || '(empty)'}`)
    }
    const copy = NODE_COPY_BY_KIND[kind] ?? {
      label: kind,
      description: '',
      inputs: [],
      outputs: [],
    }
    return {
      id: stringOr(node.nodeId, `node-${index + 1}`),
      type: 'workflow',
      position: persistedNodePosition(node.position, index),
      data: {
        label: stringOr(node.displayName, copy.label),
        description: copy.description,
        kind,
        config: toFrontendNodeConfig(node.config, kind),
        inputs: copy.inputs,
        outputs: copy.outputs,
        status: 'idle',
      },
    }
  })
  const graphEdges = nodes.flatMap<WorkflowGraphEdge>((node) => {
    const source = stringOr(node.nodeId, '')
    return backendConnections(node.config)
      .filter((connection) => source && nodeIds.has(connection.target))
      .map((connection, index) => ({
        id: `edge-${source}-${index}-${connection.target}`,
        source,
        target: connection.target,
        animated: true,
        ...(connection.label ? { label: connection.label } : {}),
      }))
  })
  return { nodes: graphNodes, edges: graphEdges }
}

function parseGraph(definitionJson: string | undefined) {
  if (!definitionJson?.trim()) {
    throw new Error('workflow definition graph is invalid: definitionJson is empty')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(definitionJson) as unknown
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`workflow definition graph is invalid: ${details}`)
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.nodes)) {
    throw new Error('workflow definition graph is invalid: nodes must be an array')
  }
  if (parsed.nodes.every(isBackendWorkflowNode)) {
    return mapBackendDefinitionGraph(parsed.nodes)
  }

  const edges = Array.isArray(parsed.edges) ? parsed.edges : []
  if (!parsed.nodes.every(isFrontendWorkflowNode) || !edges.every(isFrontendWorkflowEdge)) {
    throw new Error('workflow definition graph is invalid: node or edge structure is unsupported')
  }
  return { nodes: parsed.nodes, edges }
}

function emptyWorkflow(id: string, name = 'Untitled Workflow'): WorkflowDefinition {
  return {
    id,
    name,
    nodes: [],
    edges: [],
  }
}

function mapDefinitionSummary(entity: WorkflowDefinitionEntity): WorkflowSummary {
  const id = String(entity.id)
  return {
    id,
    name: stringOr(entity.name, `Workflow ${id}`),
    description: stringOr(entity.description, ''),
    updatedAt: formatDateTime(entity.updatedAt),
    status: normalizeBackendStatus(entity.status),
    backendDefinitionId: entity.id,
    projectId: entity.projectId,
    backendStatus: entity.status,
  }
}

function mapDefinition(entity: WorkflowDefinitionEntity): WorkflowDefinition {
  const graph = parseGraph(entity.definitionJson)
  const id = String(entity.id)
  return {
    id,
    name: stringOr(entity.name, `Workflow ${id}`),
    description: stringOr(entity.description, ''),
    nodes: graph.nodes,
    edges: graph.edges,
    backendDefinitionId: entity.id,
    projectId: entity.projectId,
    backendStatus: entity.status,
    savedAt: entity.updatedAt,
  }
}

function cloneWorkflow(workflow: WorkflowDefinition): WorkflowDefinition {
  return JSON.parse(JSON.stringify(workflow)) as WorkflowDefinition
}

function updateMockWorkflowCache(workflow: WorkflowDefinition, backendDefinitionId?: number, backendStatus?: string) {
  const savedAt = new Date().toISOString()
  const persistedDefinitionId = backendDefinitionId ?? workflow.backendDefinitionId ?? getBackendDefinitionId(workflow.id)
  const persistedStatus = backendStatus ?? workflow.backendStatus
  const savedWorkflow: WorkflowDefinition = {
    ...cloneWorkflow(workflow),
    id: persistedDefinitionId ? String(persistedDefinitionId) : workflow.id,
    backendDefinitionId: persistedDefinitionId,
    backendStatus: persistedStatus,
    savedAt,
  }

  return savedWorkflow
}

function setBackendDefinitionId(workflowId: string, backendDefinitionId: number) {
  const links = readStorageRecord<number>(DEFINITION_LINKS_STORAGE_KEY)
  links[workflowId] = backendDefinitionId
  writeStorageRecord(DEFINITION_LINKS_STORAGE_KEY, links)
}

export function getBackendDefinitionId(workflowId: string) {
  return readStorageRecord<number>(DEFINITION_LINKS_STORAGE_KEY)[workflowId]
}

function setStartedRunLink(link: StartedRunLink) {
  const links = readStorageRecord<StartedRunLink>(RUN_LINKS_STORAGE_KEY)
  links[link.runId] = link
  writeStorageRecord(RUN_LINKS_STORAGE_KEY, links)
}

export function getStartedRunLink(runId: string) {
  return readStorageRecord<StartedRunLink>(RUN_LINKS_STORAGE_KEY)[runId]
}

function currentUserId() {
  try {
    return useAuthStore().user?.userId
  } catch {
    return undefined
  }
}

function normalizeRunInput(input: WorkflowRunInput = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )
}

export const workflowApi = {
  async listWorkflows() {
    const definitions = await listDefinitions()
    return definitions.map(mapDefinitionSummary)
  },
  async getWorkflow(workflowId: string) {
    if (workflowId === 'new') {
      return emptyWorkflow('new')
    }

    const candidates = definitionIdCandidates(workflowId)
    let lastError: unknown = null
    for (const definitionId of candidates) {
      try {
        return mapDefinition(await getDefinition(definitionId))
      } catch (error) {
        lastError = error
        // Try the next candidate because browser-local definition links can be stale after database resets.
      }
    }

    throw lastError ?? new Error(`workflow definition id is invalid: ${workflowId}`)
  },
  async copyWorkflow(workflowId: string, name?: string) {
    const definitionId = getBackendDefinitionId(workflowId) ?? numericIdFromWorkflowId(workflowId)
    if (!definitionId) {
      throw new Error('backend workflow definition is required before copying')
    }
    return mapDefinition(await copyWorkflowDefinition(definitionId, name?.trim() ? { name: name.trim() } : {}))
  },
  async listWorkflowTemplates(): Promise<WorkflowDefinition[]> {
    const templates = await fetchWorkflowTemplates()
    return templates.map((template, index) => {
      const graph = mapBackendDefinitionGraph(template.nodes)
      return {
        id: `template-${index + 1}`,
        name: stringOr(template.name, `Template ${index + 1}`),
        description: stringOr(template.description, ''),
        nodes: graph.nodes,
        edges: graph.edges,
      }
    })
  },
  registerWorkflowDefinition(workflowId: string, workflowName: string) {
    return emptyWorkflow(workflowId, workflowName)
  },
  async saveWorkflow(workflow: WorkflowDefinition, _options: RealBackendOptions = {}) {
    try {
      const definitionId = workflow.id === 'new'
        ? workflow.backendDefinitionId
        : workflow.backendDefinitionId ?? getBackendDefinitionId(workflow.id) ?? numericIdFromWorkflowId(workflow.id)
      const payload = mapWorkflowToDefinitionDTO(workflow)
      const entity = definitionId
        ? await updateDefinition(definitionId, payload)
        : await createDefinition(payload)
      if (workflow.id !== 'new') {
        setBackendDefinitionId(workflow.id, entity.id)
      }
      setBackendDefinitionId(String(entity.id), entity.id)
      const savedWorkflow = updateMockWorkflowCache(workflow, entity.id, entity.status)
      return {
        ...savedWorkflow,
        id: String(entity.id),
        backendDefinitionId: entity.id,
        backendStatus: entity.status,
        savedAt: savedWorkflow.savedAt ?? new Date().toISOString(),
      }
    } catch (error) {
      throw error
    }
  },
  async deleteWorkflow(workflowId: string) {
    const definitionId = getBackendDefinitionId(workflowId) ?? numericIdFromWorkflowId(workflowId)
    if (!definitionId) {
      return
    }
    await deleteDefinition(definitionId)
  },
  async startRun(workflowId: string, input: WorkflowRunInput = {}, options: RealBackendOptions = {}): Promise<StartedRunLink> {
    const backendDefinitionId = getBackendDefinitionId(workflowId)

    if (!backendDefinitionId) {
      if (options.allowMockFallback === false) {
        throw new Error('backend workflow definition is required before starting a real run')
      }
      throw new Error('backend workflow definition is required before starting a real run')
    }

    try {
      const normalizedInput = normalizeRunInput(input)
      const instance = await startInstance(backendDefinitionId, {
        userId: currentUserId(),
        input: normalizedInput,
      })
      const runId = `run-${instance.id}`
      const link: StartedRunLink = {
        runId,
        workflowId,
        backendInstanceId: instance.id,
        runtimeWorkflowId: String(instance.id),
        definitionId: instance.definitionId,
        backendStatus: instance.status,
      }

      setStartedRunLink(link)

      return {
        ...link,
        runId,
        workflowId,
      }
    } catch (error) {
      throw error
    }
  },
}
