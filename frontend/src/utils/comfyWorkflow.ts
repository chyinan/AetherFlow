// pattern: Functional Core
export interface ComfyBinding { nodeId: string; inputName: string; parameter: string }
export const comfyParameters = ['prompt', 'negativePrompt', 'seed', 'steps', 'cfgScale', 'sampler', 'scheduler', 'width', 'height', 'batchSize', 'denoiseStrength', 'checkpoint', 'vae', 'sourceImage'] as const
export const comfyUiGuidance = '原图已保留。请在原有 ComfyUI 中导出 API 格式 JSON，再载入执行图；当前界面 JSON 只能查看与保存，不能运行。'
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export function decodeComfyGraph(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value === 'string') {
    try { const parsed: unknown = JSON.parse(value); if (isRecord(parsed)) return parsed } catch { /* 保留无效文本，由界面给出错误。 */ }
  }
  return null
}
export const comfyGraphValue = (config: Record<string, unknown>) => config.workflowJson ?? config.workflow
export const isComfyPromptSummary = (config: Record<string, unknown>) => config.stylePreset === 'comfyui-import'
export function hasComfySourceBinding(config: Record<string, unknown>) {
  const graph = comfyGraphValue(config)
  return String(config.provider).toUpperCase() === 'COMFYUI' && describeComfyGraph(graph).format === 'API'
    && !comfyBindingError(config.workflowBindings, graph) && Array.isArray(config.workflowBindings)
    && config.workflowBindings.some((binding) => isRecord(binding) && binding.parameter === 'sourceImage')
}
export function describeComfyGraph(value: unknown) {
  const graph = decodeComfyGraph(value) ?? {}
  const ui = Array.isArray(graph.nodes)
  const entries = ui ? (graph.nodes as unknown[]).map((node) => isRecord(node) ? [String(node.id ?? ''), node] as const : ['', {}] as const) : Object.entries(graph).map(([id, node]) => [id, isRecord(node) ? node : {}] as const)
  const nodes = entries.map(([id, node]) => ({ id, type: String(ui ? node.type ?? '' : node.class_type ?? ''), inputs: isRecord(node.inputs) ? node.inputs : {}, raw: node }))
  const valid = nodes.length > 0 && nodes.every((node) => node.id && node.type.trim()) && new Set(nodes.map((node) => node.id)).size === nodes.length
    && (ui ? !Object.values(graph).some((node) => isRecord(node) && 'class_type' in node) : entries.every(([, node]) => !('inputs' in node) || isRecord(node.inputs)))
  const links = ui && Array.isArray(graph.links) ? graph.links.length : nodes.reduce((count, node) => count + Object.values(node.inputs).filter((input) => Array.isArray(input) && input.length === 2).length, 0)
  return { graph, raw: value, nodes, links, format: (valid ? ui ? 'UI' : 'API' : 'INVALID') as 'UI' | 'API' | 'INVALID' }
}
export function comfyBindingError(value: unknown, graph: unknown): string | null {
  if (value == null) return null
  if (!Array.isArray(value)) return 'workflowBindings 必须是数组'
  const nodes = describeComfyGraph(graph).nodes
  const targets = new Set<string>()
  for (const binding of value) {
    if (!isRecord(binding) || typeof binding.nodeId !== 'string' || typeof binding.inputName !== 'string' || !comfyParameters.includes(binding.parameter as typeof comfyParameters[number])) return '绑定须指定 nodeId、inputName 和支持的 parameter'
    if (!Object.hasOwn(nodes.find((node) => node.id === binding.nodeId)?.inputs ?? {}, binding.inputName)) return `绑定目标不存在：${binding.nodeId}.${binding.inputName}；请重新选择执行图中的输入`
    const key = JSON.stringify([binding.nodeId, binding.inputName])
    if (targets.has(key)) return `重复绑定目标：${binding.nodeId}.${binding.inputName}`
    targets.add(key)
  }
  return null
}
