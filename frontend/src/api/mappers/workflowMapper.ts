import type { WorkflowDefinitionDTO } from '@/api/modules/workflow'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'

type BackendNodeType =
  | 'UPLOAD'
  | 'OCR'
  | 'WHISPER'
  | 'SUMMARY'
  | 'EMBEDDING'
  | 'END'
  | 'CONDITION'

const BACKEND_NODE_TYPE_BY_KIND: Record<string, BackendNodeType> = {
  whisper: 'WHISPER',
  summary: 'SUMMARY',
  output: 'END',
  condition: 'CONDITION',
  'document-extractor': 'OCR',
  'knowledge-retrieval': 'EMBEDDING',
  ffmpeg: 'UPLOAD',
  audio: 'UPLOAD',
}

const UNSUPPORTED_NODE_HINTS: Record<string, string> = {
  'video-generate': 'VideoGenerate is not available in the backend workflow node catalog yet.',
}

function toRecord(value: unknown) {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }

  const normalized = String(value).trim()
  return normalized || fallback
}

function optionalString(value: unknown) {
  const normalized = stringValue(value)
  return normalized || undefined
}

function booleanValue(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === undefined || value === null || value === '') {
    return fallback
  }

  return String(value).toLowerCase() === 'true'
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function withNextNodes(config: Record<string, unknown>, nextNodes: string[]) {
  return {
    ...config,
    nextNodes: [...nextNodes],
  }
}

function toBackendNodeType(node: WorkflowGraphNode): BackendNodeType {
  const kind = String(node.data.kind)
  const nodeType = BACKEND_NODE_TYPE_BY_KIND[kind]
  if (nodeType) {
    return nodeType
  }

  const hint = UNSUPPORTED_NODE_HINTS[kind] ?? 'Use a backend-supported node or add a backend executor/catalog entry first.'
  throw new Error(`Unsupported workflow node "${node.data.label}" (${kind}). ${hint}`)
}

function normalizeUploadConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const fileId = optionalNumber(config.fileId)
  return withNextNodes({
    ...(fileId === undefined ? {} : { fileId }),
    fileIdVariable: stringValue(config.fileIdVariable, 'fileId'),
  }, nextNodes)
}

function normalizeOcrConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const fileId = optionalNumber(config.fileId)
  const mock = booleanValue(config.mock, false)

  return withNextNodes({
    ...(fileId === undefined ? {} : { fileId }),
    fileIdVariable: stringValue(config.fileIdVariable ?? config.file, 'fileId'),
    language: stringValue(config.language, 'auto'),
    enableTable: booleanValue(config.enableTable, true),
    enableLayout: booleanValue(config.enableLayout, false),
    mock,
    provider: stringValue(config.provider, mock ? 'mock' : 'tesseract'),
  }, nextNodes)
}

function normalizeWhisperConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    ...(optionalString(config.fileUrl) ? { fileUrl: optionalString(config.fileUrl) } : {}),
    fileUrlVariable: stringValue(config.fileUrlVariable, 'fileUrl'),
    language: stringValue(config.language, 'auto'),
    prompt: stringValue(config.prompt, ''),
  }, nextNodes)
}

function normalizeSummaryConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    ...(optionalString(config.text) ? { text: optionalString(config.text) } : {}),
    textVariable: stringValue(config.textVariable ?? config.context, 'transcription'),
    language: stringValue(config.language, 'Chinese'),
    prompt: stringValue(config.prompt, 'Focus on action items'),
    ...(optionalString(config.provider) ? { provider: optionalString(config.provider) } : {}),
    ...(optionalString(config.model) ? { model: optionalString(config.model) } : {}),
    ...(optionalString(config.promptVersion) ? { promptVersion: optionalString(config.promptVersion) } : {}),
  }, nextNodes)
}

function normalizeEmbeddingConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const chunkSize = Math.max(1, Math.floor(numberValue(config.chunkSize, 512)))
  const overlap = Math.min(Math.max(0, Math.floor(numberValue(config.overlap, 128))), chunkSize - 1)

  return withNextNodes({
    provider: stringValue(config.provider, 'ollama'),
    model: stringValue(config.model, 'nomic-embed-text'),
    ...(optionalString(config.text) ? { text: optionalString(config.text) } : {}),
    textVariable: stringValue(config.textVariable, 'ocrText'),
    chunkSize,
    overlap,
    vectorCollection: stringValue(config.vectorCollection, 'workflow-embeddings'),
  }, nextNodes)
}

function normalizeEndConfig(config: Record<string, unknown>, nextNodes: string[]) {
  const output = toRecord(config.output)
  const outputName = stringValue(config.outputName, 'result')
  const outputValue = config.outputValue ?? config.value

  return withNextNodes({
    output: Object.keys(output).length > 0
      ? output
      : { [outputName]: outputValue === undefined || outputValue === '' ? 'completed' : outputValue },
    variables: toRecord(config.variables),
  }, nextNodes)
}

function normalizeConditionConfig(config: Record<string, unknown>, nextNodes: string[]) {
  return withNextNodes({
    variable: stringValue(config.variable, 'summary'),
    operator: stringValue(config.operator, 'EXISTS'),
    ...(config.value === undefined || config.value === '' ? {} : { value: config.value }),
    trueBranch: stringValue(config.trueBranch, 'true'),
    falseBranch: stringValue(config.falseBranch, 'false'),
  }, nextNodes)
}

function normalizeNodeConfig(node: WorkflowGraphNode, nodeType: BackendNodeType, nextNodes: string[]) {
  const config = toRecord(node.data.config)

  switch (nodeType) {
    case 'UPLOAD':
      return normalizeUploadConfig(config, nextNodes)
    case 'OCR':
      return normalizeOcrConfig(config, nextNodes)
    case 'WHISPER':
      return normalizeWhisperConfig(config, nextNodes)
    case 'SUMMARY':
      return normalizeSummaryConfig(config, nextNodes)
    case 'EMBEDDING':
      return normalizeEmbeddingConfig(config, nextNodes)
    case 'END':
      return normalizeEndConfig(config, nextNodes)
    case 'CONDITION':
      return normalizeConditionConfig(config, nextNodes)
  }
}

function buildNextNodeIndex(workflow: WorkflowDefinition) {
  return workflow.edges.reduce<Record<string, string[]>>((acc, edge) => {
    if (!edge.source || !edge.target) {
      return acc
    }

    acc[edge.source] = [...(acc[edge.source] ?? []), edge.target]
    return acc
  }, {})
}

export function mapWorkflowToDefinitionDTO(workflow: WorkflowDefinition): WorkflowDefinitionDTO {
  const nextNodeIndex = buildNextNodeIndex(workflow)

  return {
    name: workflow.name,
    description: workflow.description,
    nodes: workflow.nodes.map((node) => {
      const nodeType = toBackendNodeType(node)
      return {
        nodeId: node.id,
        nodeType,
        displayName: node.data.label,
        config: normalizeNodeConfig(node, nodeType, nextNodeIndex[node.id] ?? []),
      }
    }),
  }
}
