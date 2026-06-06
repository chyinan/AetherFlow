import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import {
  createDefinition,
  deleteDefinition,
  getDefinition,
  listDefinitions,
  startInstance,
  updateDefinition,
  type WorkflowDefinitionEntity,
} from '@/api/modules/workflow'
import { useAuthStore } from '@/stores/authStore'
import type { WorkflowDefinition, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind, WorkflowSummary } from '@/types/workflow'

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
  const direct = Number(workflowId)
  if (Number.isFinite(direct) && direct > 0) {
    return direct
  }

  const match = workflowId.match(/(?:definition-|workflow-|wf-)?(\d+)$/)
  const parsed = match ? Number(match[1]) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function definitionIdCandidates(workflowId: string) {
  const numericId = numericIdFromWorkflowId(workflowId)
  const linkedId = getBackendDefinitionId(workflowId)
  const isDirectNumericId = String(numericId) === workflowId

  return [
    ...(isDirectNumericId ? [numericId] : []),
    linkedId,
    ...(!isDirectNumericId ? [numericId] : []),
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

  return date.toLocaleString('zh-CN', { hour12: false })
}

interface BackendWorkflowNode {
  nodeId?: string
  nodeType?: string
  displayName?: string
  config?: Record<string, unknown>
}

const NODE_KIND_BY_BACKEND_TYPE: Record<string, WorkflowNodeKind> = {
  START: 'start',
  PROMPT: 'prompt',
  IMAGE_GENERATION: 'image-generation',
  UPSCALE: 'upscale',
  SAVE_IMAGE: 'save-image',
  UPLOAD: 'ffmpeg',
  WHISPER: 'whisper',
  SUMMARY: 'summary',
  EXPORT: 'export',
  END: 'output',
  OCR: 'document-extractor',
  EMBEDDING: 'knowledge-retrieval',
  CONDITION: 'condition',
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
  ffmpeg: {
    label: '读取视频文件',
    description: '从文件服务读取上传视频元数据，向后续真实运行节点传递 fileUrl。',
    inputs: ['fileId'],
    outputs: ['fileUrl', 'fileObjectKey', 'fileSize'],
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

function toFrontendNodeConfig(config: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !GRAPH_CONFIG_KEYS.has(key)),
  ) as WorkflowGraphNode['data']['config']
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
  if (isRecord(config.branches)) {
    Object.values(config.branches).forEach((target) => {
      if (typeof target === 'string' && target.trim()) {
        targets.push(target.trim())
      }
    })
  }
  return [...new Set(targets)]
}

function mapBackendDefinitionGraph(nodes: BackendWorkflowNode[]) {
  const nodeIds = new Set(nodes.map((node) => node.nodeId).filter(Boolean))
  const graphNodes = nodes.map<WorkflowGraphNode>((node, index) => {
    const nodeType = stringOr(node.nodeType, '').toUpperCase()
    const kind = NODE_KIND_BY_BACKEND_TYPE[nodeType] ?? 'output'
    const copy = NODE_COPY_BY_KIND[kind] ?? NODE_COPY_BY_KIND.output
    return {
      id: stringOr(node.nodeId, `node-${index + 1}`),
      type: 'workflow',
      position: {
        x: 80 + index * 310,
        y: index % 2 === 0 ? 170 : 110,
      },
      data: {
        label: stringOr(node.displayName, copy.label),
        description: copy.description,
        kind,
        config: toFrontendNodeConfig(node.config),
        inputs: copy.inputs,
        outputs: copy.outputs,
        status: 'idle',
      },
    }
  })
  const graphEdges = nodes.flatMap<WorkflowGraphEdge>((node) => {
    const source = stringOr(node.nodeId, '')
    return backendTargets(node.config)
      .filter((target) => source && nodeIds.has(target))
      .map((target) => ({
        id: `edge-${source}-${target}`,
        source,
        target,
        animated: true,
      }))
  })
  return { nodes: graphNodes, edges: graphEdges }
}

function parseGraph(definitionJson: string | undefined) {
  if (!definitionJson) {
    return { nodes: [] as WorkflowGraphNode[], edges: [] as WorkflowGraphEdge[] }
  }

  try {
    const parsed = JSON.parse(definitionJson) as {
      nodes?: unknown[]
      edges?: unknown[]
    }
    if (Array.isArray(parsed.nodes) && parsed.nodes.every(isBackendWorkflowNode)) {
      return mapBackendDefinitionGraph(parsed.nodes)
    }
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes as WorkflowGraphNode[] : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges as WorkflowGraphEdge[] : [],
    }
  } catch {
    return { nodes: [] as WorkflowGraphNode[], edges: [] as WorkflowGraphEdge[] }
  }
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
    for (const definitionId of candidates) {
      try {
        return mapDefinition(await getDefinition(definitionId))
      } catch {
        // Try the next candidate because browser-local definition links can be stale after database resets.
      }
    }

    return emptyWorkflow(workflowId, workflowId.replace(/^wf-/, '').replaceAll('-', ' '))
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
