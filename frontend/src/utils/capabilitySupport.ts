// pattern: Functional Core
import type { AiWorkflowCapabilities } from '@/api/modules/ai'
import type { WorkflowNodeKind } from '@/types/workflow'

const capabilityTypes = [
  'LLM', 'SUMMARY', 'TRANSLATE', 'WHISPER', 'FFMPEG', 'IMAGE_GENERATION', 'UPSCALE',
  'OCR', 'EMBEDDING', 'CODE', 'AGENT', 'QUESTION_UNDERSTAND', 'QUESTION_CLASSIFIER',
  'PARAMETER_EXTRACTOR', 'KNOWLEDGE_RETRIEVAL', 'UNKNOWN',
] as const
const errorCategories = ['CAPABILITY_UNAVAILABLE', 'CHECK_FAILED', 'RUNTIME_UNREACHABLE', 'NOT_REPORTED'] as const
export type CapabilityErrorCategory = typeof errorCategories[number]

const capabilityByKind: Partial<Record<WorkflowNodeKind, string>> = {
  llm: 'LLM', summary: 'LLM', translate: 'LLM', agent: 'LLM',
  'question-understand': 'LLM', 'question-classifier': 'LLM', 'parameter-extractor': 'LLM',
  'document-extractor': 'OCR', embedding: 'EMBEDDING', code: 'CODE', whisper: 'WHISPER',
  'image-generation': 'IMAGE_GENERATION', upscale: 'UPSCALE',
}
export function capabilityForNode(kind: WorkflowNodeKind | undefined) {
  return kind ? capabilityByKind[kind] : undefined
}

/** 只接受目录协议的结构；损坏或不完整的快照不能恢复可执行状态。 */
export function isWorkflowCapabilitySnapshot(value: unknown): value is AiWorkflowCapabilities {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as AiWorkflowCapabilities
  const strings = (list: unknown) => Array.isArray(list) && list.every((item) => typeof item === 'string' && Boolean(item.trim()))
  return typeof snapshot.runtimeReachable === 'boolean'
    && typeof snapshot.llmExecutable === 'boolean' && typeof snapshot.whisperExecutable === 'boolean'
    && strings(snapshot.supportedNodeTypes) && strings(snapshot.executableNodeTypes)
    && strings(snapshot.llmProviders) && strings(snapshot.imageProviders)
    && Boolean(snapshot.unavailableReasons) && typeof snapshot.unavailableReasons === 'object'
    && !Array.isArray(snapshot.unavailableReasons)
    && Object.values(snapshot.unavailableReasons).every((reason) => typeof reason === 'string')
}

/** 导入的标识也可能携带正文或密钥；仅输出产品生成的标准格式，其他标识隐藏。 */
function safeLocation(value: string | undefined, node = false) {
  if (!value) return undefined
  if (value === 'new' && !node) return 'new'
  if (/^[0-9]{1,18}$/.test(value) || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) return value
  const kinds = Object.keys(capabilityByKind).join('|')
  if (node && new RegExp(`^node-(?:${kinds})(?:-[0-9]{1,12})?(?:-copy-[0-9]{1,12}){0,5}$`).test(value)) return value
  return '[redacted]'
}

/** 明确白名单，不接收错误正文、节点配置、标题、URL 或账户信息。 */
export function buildCapabilitySupportSummary(input: {
  capabilityType: string
  category: CapabilityErrorCategory
  at: Date
  includeLocation: boolean
  workflowId?: string
  nodeId?: string
}) {
  return JSON.stringify({
    capability: capabilityTypes.includes(input.capabilityType as typeof capabilityTypes[number]) ? input.capabilityType : 'UNKNOWN',
    errorCategory: errorCategories.includes(input.category) ? input.category : 'CAPABILITY_UNAVAILABLE',
    time: Number.isFinite(input.at.getTime()) ? input.at.toISOString() : 'unknown',
    ...(input.includeLocation ? {
      workflowId: safeLocation(input.workflowId),
      nodeId: safeLocation(input.nodeId, true),
    } : {}),
  }, null, 2)
}
