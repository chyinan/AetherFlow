// pattern: Functional Core
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import type { NodeTemplate, WorkflowDefinition } from '@/types/workflow'
import { validateMapping } from '@/utils/structuredMapping'
import { upstreamVariables } from '@/utils/workflowVariables'

export interface PreflightIssue { id: string; level: 'blocking' | 'warning' | 'unknown'; code: string; nodeId?: string; nodeLabel?: string; field?: string; detail?: string }
const blank = (value: unknown) => value === undefined || value === null || typeof value === 'string' && !value.trim()
const isObject = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value)
function typeMatches(type: string, value: unknown) {
  switch (type.toUpperCase()) {
    case 'STRING': return typeof value === 'string'
    case 'NUMBER': return typeof value === 'number' && Number.isFinite(value)
    case 'BOOLEAN': return typeof value === 'boolean'
    case 'OBJECT': return isObject(value)
    case 'ARRAY': return Array.isArray(value)
    default: return true
  }
}
const requiredAlternatives: Record<string, string[]> = {
  UPLOAD: ['fileId', 'fileIdVariable'], OCR: ['fileId', 'fileIdVariable'], FFMPEG: ['fileUrl', 'fileUrlVariable'],
  WHISPER: ['fileUrl', 'fileUrlVariable', 'fileId', 'fileIdVariable'], LLM: ['prompt', 'promptVariable', 'context'],
  SUMMARY: ['text', 'textVariable'], TRANSLATE: ['text', 'textVariable'], EMBEDDING: ['text', 'textVariable'],
  IMAGE_GENERATION: ['prompt', 'promptVariable'], URL_FETCH: ['url', 'urlVariable'], HTTP_REQUEST: ['url', 'urlVariable'],
  AGENT: ['task', 'taskVariable'], QUESTION_UNDERSTAND: ['input', 'inputVariable'], QUESTION_CLASSIFIER: ['input', 'inputVariable'],
  PARAMETER_EXTRACTOR: ['input', 'inputVariable'], KNOWLEDGE_RETRIEVAL: ['queryText', 'queryVariable'],
}
/** 与保存使用同一规范化配置、服务端目录字段；静态检查不替代服务端权限、连接与能力门禁。 */
export function buildWorkflowPreflight(workflow: WorkflowDefinition, templates: ReadonlyArray<NodeTemplate>, options: { catalogLoaded: boolean; capabilitiesLoaded: boolean; runtimeFileId?: string } ): PreflightIssue[] {
  const issues: PreflightIssue[] = []
  const add = (level: PreflightIssue['level'], code: string, extra: Partial<PreflightIssue> = {}) => issues.push({ id: `${extra.nodeId ?? 'workflow'}:${extra.field ?? code}:${code}:${issues.length}`, level, code, ...extra })
  if (!workflow.nodes.length) add('blocking', 'empty')
  const ids = new Set(workflow.nodes.map((node) => node.id))
  if (ids.size !== workflow.nodes.length) add('blocking', 'duplicateNodes')
  for (const edge of workflow.edges) if (!ids.has(edge.source) || !ids.has(edge.target)) add('blocking', 'danglingEdge', { detail: edge.id })
  if (!options.catalogLoaded) add('unknown', 'catalogUnknown')
  if (!options.capabilitiesLoaded) add('unknown', 'capabilitiesUnknown')
  for (const node of workflow.nodes) {
    const location = { nodeId: node.id, nodeLabel: node.data.label }
    let normalized
    try { normalized = mapWorkflowToDefinitionDTO({ ...workflow, nodes: [node] }).nodes?.[0] }
    catch (error) { add('blocking', 'mapping', { ...location, detail: error instanceof Error ? error.message : String(error) }); continue }
    if (!normalized) continue
    const config = normalized.config ?? {}
    const template = templates.find((item) => item.kind === node.data.kind)
    if (options.catalogLoaded && !template?.configSchema) add('unknown', 'nodeSchemaUnknown', location)
    for (const field of template?.configSchema ?? []) {
      let value = config[field.name]
      if (normalized.nodeType === 'IMAGE_GENERATION' && field.name === 'prompt' && blank(value)) value = config.promptVariable
      if (field.required && blank(value)) { add('blocking', 'required', { ...location, field: field.name }); continue }
      if (value == null) continue
      const imageWorkflowObject = ['IMAGE_GENERATION', 'UPSCALE'].includes(normalized.nodeType) && field.name === 'workflowJson' && isObject(value)
      if (!imageWorkflowObject && !typeMatches(field.type, value)) add('blocking', 'type', { ...location, field: field.name, detail: field.type })
      const dynamicOption = ['IMAGE_GENERATION', 'UPSCALE'].includes(normalized.nodeType) && !blank(config.connectionId) && ['sampler', 'scheduler', 'upscaler'].includes(field.name)
      if (!dynamicOption && field.options?.length && typeof value === 'string' && !field.options.some((option) => option.toLowerCase() === value.trim().toLowerCase())) add('blocking', 'enum', { ...location, field: field.name, detail: field.options.join(', ') })
    }
    const alternatives = requiredAlternatives[normalized.nodeType]
    if (alternatives && alternatives.every((field) => blank(config[field]))) add('blocking', 'requiredAlternative', { ...location, field: alternatives[0], detail: alternatives.join(' / ') })
    if (normalized.nodeType === 'TEMPLATE_TRANSFORM' && config.transformMode === 'structured') {
      try { validateMapping(config.mapping) } catch (error) { add('blocking', 'mapping', { ...location, field: 'mapping', detail: error instanceof Error ? error.message : String(error) }) }
    } else if (normalized.nodeType === 'TEMPLATE_TRANSFORM' && blank(config.template)) add('blocking', 'required', { ...location, field: 'template' })
    if (normalized.nodeType === 'CODE' && blank(config.code)) add('blocking', 'required', { ...location, field: 'code' })
    const choices = upstreamVariables(node.id, workflow.nodes, workflow.edges, templates)
    for (const [field, value] of Object.entries(config)) {
      if (!field.endsWith('Variable') || value == null) continue
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value).trim())) { add('blocking', 'variableName', { ...location, field }); continue }
      if (field === 'outputVariable') continue
      const choice = choices.find((item) => item.name === value)
      if (choice?.writers.length && choice.writers.length > 1) add('warning', 'duplicateVariable', { ...location, field, detail: choice.writers.map((writer) => writer.label).join(', ') })
      else if (!choice && !(value === 'fileId' && options.runtimeFileId)) add('warning', 'unresolvedVariable', { ...location, field, detail: String(value) })
    }
    if (template?.availability?.available === false) add('warning', 'capabilityUnavailable', { ...location, field: node.data.kind === 'whisper' ? 'whisperEnvironment' : ['image-generation', 'upscale'].includes(node.data.kind) ? 'connectionId' : 'model', detail: template.availability.reason ?? undefined })
    if (['image-generation', 'upscale'].includes(node.data.kind)) add('unknown', 'connectionUnknown', { ...location, field: 'connectionId' })
  }
  add('unknown', 'serverRequired')
  return issues
}
