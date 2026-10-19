// pattern: Functional Core
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'
import { parseCustomDefinition } from '@/utils/customNodes'
import type { NodeTemplate, WorkflowGraphEdge, WorkflowGraphNode, WorkflowNodeKind } from '@/types/workflow'

export interface VariableOutput { name: string; type: string }
export interface UpstreamVariable extends VariableOutput {
  sources: Array<{ id: string; label: string }>
  writers: Array<{ id: string; label: string }>
}
const fixedOutputs: Partial<Record<WorkflowNodeKind, Record<string, string>>> = {
  upload: { fileId: 'NUMBER', fileUrl: 'STRING', fileObjectKey: 'STRING', fileBucket: 'STRING', fileOriginalName: 'STRING', fileContentType: 'STRING', fileSize: 'NUMBER' },
  ffmpeg: { mediaFileId: 'NUMBER', mediaUrl: 'STRING', mediaObjectKey: 'STRING', fileId: 'NUMBER', fileUrl: 'STRING', fileObjectKey: 'STRING' },
  prompt: { prompt: 'STRING', negativePrompt: 'STRING', promptMetadata: 'OBJECT' },
  export: { exportFormat: 'STRING', exportFile: 'OBJECT', exportFileId: 'NUMBER', exportFileUrl: 'STRING', exportObjectKey: 'STRING' },
  'document-extractor': { ocrText: 'STRING', ocrLanguage: 'STRING', ocrConfidence: 'NUMBER', ocrPageCount: 'NUMBER' },
  whisper: { transcription: 'STRING', segments: 'ARRAY', srtFileId: 'NUMBER', srtObjectKey: 'STRING', srtUrl: 'STRING', durationSeconds: 'NUMBER' },
  llm: { completionText: 'STRING', completion: 'STRING', jsonData: 'OBJECT' },
  summary: { summary: 'STRING' },
  translate: { translation: 'STRING', translatedText: 'STRING' },
}
const extraOutputs: Partial<Record<WorkflowNodeKind, Record<string, string>>> = {
  'url-fetch': { urlSourceUrl: 'STRING', urlTitle: 'STRING', urlText: 'STRING', urlCharCount: 'NUMBER', urlContentType: 'STRING', urlStatusCode: 'NUMBER' },
  'knowledge-retrieval': { retrievalContext: 'STRING', retrievalResults: 'ARRAY', retrievalCount: 'NUMBER', retrievalDatasetId: 'UNKNOWN' },
  'http-request': { httpResponse: 'OBJECT', httpStatusCode: 'NUMBER', httpBodyText: 'STRING', httpOk: 'BOOLEAN', httpError: 'STRING' },
}
const configurableOutputs: Partial<Record<WorkflowNodeKind, [string, string]>> = {
  'url-fetch': ['urlText', 'STRING'], 'http-request': ['httpResponse', 'OBJECT'],
  'knowledge-retrieval': ['retrievalContext', 'STRING'], code: ['codeResult', 'UNKNOWN'],
  'variable-aggregate': ['merged', 'OBJECT'], iteration: ['iterationItems', 'ARRAY'], loop: ['loopState', 'UNKNOWN'],
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const text = (value: unknown, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback
function valueType(value: unknown) { return Array.isArray(value) ? 'ARRAY' : value === null ? 'UNKNOWN' : typeof value === 'object' ? 'OBJECT' : typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : typeof value === 'string' ? 'STRING' : 'UNKNOWN' }

/** 输出名称必须是运行时全局变量键，不能把节点输出对象或旧画布占位端口当作变量。 */
export function nodeVariableOutputs(node: WorkflowGraphNode, templates: ReadonlyArray<NodeTemplate> = []): VariableOutput[] {
  const { kind } = node.data
  let config: Record<string, unknown>
  try {
    config = mapWorkflowToDefinitionDTO({ id: '', name: '', nodes: [node], edges: [] }).nodes?.[0]?.config ?? {}
  } catch {
    // 无法保存的配置不能被描述成可用输出，原始编辑值由检查器保留。
    return []
  }
  if (kind === 'start') return Object.entries(object(config.variables)).map(([name, value]) => ({ name, type: valueType(value) }))
  if (config.customDefinition) {
    try { return parseCustomDefinition(config.customDefinition).outputs.map(field => ({ name: field.name, type: field.type })) }
    catch { return [] }
  }
  if (kind === 'output') return []
  if (kind === 'variable-assigner') return text(config.variable) ? [{ name: text(config.variable), type: Object.hasOwn(config, 'value') ? valueType(config.value) : 'UNKNOWN' }] : []
  if (kind === 'template-transform') return [{ name: text(config.outputVariable, config.transformMode === 'structured' ? 'mappedValue' : 'renderedText'), type: config.transformMode === 'structured' ? 'UNKNOWN' : 'STRING' }]
  const configured = configurableOutputs[kind]
  if (configured) {
    // 仅叠加执行器确实写入全局上下文的固定键；自定义主键不删除固定别名。
    const primary = { [text(config.outputVariable, configured[0])]: configured[1] }
    const outputs = kind === 'knowledge-retrieval' ? { ...primary, ...extraOutputs[kind] } : { ...extraOutputs[kind], ...primary }
    return Object.entries(outputs).map(([name, type]) => ({ name, type }))
  }
  if (fixedOutputs[kind]) return Object.entries(fixedOutputs[kind]).map(([name, type]) => ({ name, type }))
  const schema = templates.find((item) => item.kind === kind)?.outputSchema
  // 无目录时不回退到旧画布端口，端口名不一定是执行器的全局变量。
  return (schema ?? [])
    .filter((item) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name))
    .map((item) => ({ name: item.name, type: item.type?.toUpperCase() || 'UNKNOWN' }))
}

export function upstreamNodeIds(nodeId: string, nodes: ReadonlyArray<WorkflowGraphNode>, edges: ReadonlyArray<WorkflowGraphEdge>) {
  const existing = new Set(nodes.map((node) => node.id))
  const visited = new Set([nodeId]); const pending = [nodeId]
  while (pending.length) {
    const target = pending.pop()
    for (const edge of edges) if (edge.target === target && existing.has(edge.source) && !visited.has(edge.source)) {
      visited.add(edge.source); pending.push(edge.source)
    }
  }
  visited.delete(nodeId)
  return visited
}

/** 同名候选合并，另列所有写入者；连线只说明可到达，不承诺分支一定执行或命名空间隔离。 */
export function upstreamVariables(nodeId: string, nodes: ReadonlyArray<WorkflowGraphNode>, edges: ReadonlyArray<WorkflowGraphEdge>, templates: ReadonlyArray<NodeTemplate> = []): UpstreamVariable[] {
  const upstream = upstreamNodeIds(nodeId, nodes, edges)
  const grouped = new Map<string, UpstreamVariable>()
  for (const node of nodes) for (const output of nodeVariableOutputs(node, templates)) {
    let entry = grouped.get(output.name)
    if (!entry) { entry = { ...output, sources: [], writers: [] }; grouped.set(output.name, entry) }
    if (entry.type !== output.type) entry.type = 'UNKNOWN'
    const source = { id: node.id, label: node.data.label }
    entry.writers.push(source)
    if (upstream.has(node.id)) entry.sources.push(source)
  }
  return [...grouped.values()].filter((item) => item.sources.length).sort((a, b) => a.name.localeCompare(b.name))
}
