// pattern: Functional Core
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import { createWorkflowNodeDataFromTemplate } from '@/utils/workflowNodeClone'
import { buildWorkflowCopilotContext, redactCopilotValue, type WorkflowCopilotSnapshot } from './workflowCopilotActions'

type CanvasEditResult =
  | { ok: true; nodes: Array<WorkflowGraphNode>; edges: Array<WorkflowGraphEdge> }
  | { ok: false; error: string }

/** 所有操作先在候选图执行，通过后由 store 一次提交。 */
export function compileCanvasEdit(snapshot: Readonly<WorkflowCopilotSnapshot>, edit: Readonly<CopilotCanvasEdit>): CanvasEditResult {
  if (edit.status !== 'READY' || !Array.isArray(edit.operations) || edit.operations.length === 0 || edit.operations.length > 80) {
    return { ok: false, error: 'AI 未返回可应用的画布修改。' }
  }
  let nodes: Array<WorkflowGraphNode> = JSON.parse(JSON.stringify(snapshot.nodes))
  let edges = snapshot.edges.map((edge) => ({ ...edge }))
  for (const [index, operation] of edit.operations.entries()) {
    if (operation.config && !safeConfig(operation.config)) return { ok: false, error: 'AI 修改包含不允许的配置字段。' }
    if (operation.position && (!Number.isFinite(operation.position.x) || !Number.isFinite(operation.position.y)
      || Math.abs(operation.position.x) > 100000 || Math.abs(operation.position.y) > 100000)) {
      return { ok: false, error: 'AI 返回了无效的节点位置。' }
    }
    const node = nodes.find((item) => item.id === operation.nodeId)
    switch (operation.type) {
      case 'add_node': {
        if (!operation.nodeId || !/^[\w-]{1,100}$/.test(operation.nodeId) || node) return { ok: false, error: 'AI 新建节点的 ID 无效或重复。' }
        const template = snapshot.templates.find((item) => item.kind === operation.kind)
        if (!template || template.availability?.available === false) return { ok: false, error: `节点能力不可用：${operation.kind}` }
        const data = createWorkflowNodeDataFromTemplate(template, 'AI 已编辑，尚未运行')
        data.config = { ...data.config, ...operation.config }
        if (operation.label) data.label = operation.label
        const right = Math.max(-240, ...nodes.map((item) => item.position.x))
        nodes.push({ id: operation.nodeId, type: 'workflow', position: operation.position ?? { x: right + 320, y: 180 }, data })
        break
      }
      case 'update_node':
        if (!node) return { ok: false, error: `找不到要修改的节点：${operation.nodeId}` }
        node.data = { ...node.data, config: { ...node.data.config, ...operation.config }, label: operation.label ?? node.data.label }
        node.position = operation.position ?? node.position
        break
      case 'delete_node':
        if (!node) return { ok: false, error: `找不到要删除的节点：${operation.nodeId}` }
        nodes = nodes.filter((item) => item.id !== operation.nodeId)
        edges = edges.filter((edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId)
        break
      case 'connect':
        if (!nodes.some((item) => item.id === operation.source) || !nodes.some((item) => item.id === operation.target)
          || operation.source === operation.target) return { ok: false, error: 'AI 连线引用了不存在的节点或形成自环。' }
        if (edges.some((edge) => edge.source === operation.source && edge.target === operation.target)) return { ok: false, error: 'AI 返回了重复连线。' }
        edges.push({ id: uniqueEdgeId(edges, index), source: operation.source!, target: operation.target!, animated: true, label: operation.label })
        break
      case 'disconnect': {
        const matching = edges.some((edge) => edge.source === operation.source && edge.target === operation.target)
        if (!matching) return { ok: false, error: '找不到要移除的连线。' }
        edges = edges.filter((edge) => edge.source !== operation.source || edge.target !== operation.target)
        break
      }
      default:
        return { ok: false, error: 'AI 返回了未知的画布操作。' }
    }
  }
  if (nodes.length > 100 || nodes.filter((node) => node.data.kind === 'start').length !== 1) {
    return { ok: false, error: '画布必须包含唯一的开始节点，且不超过 100 个节点。' }
  }
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(id: string): boolean {
    if (visiting.has(id)) return false
    if (visited.has(id)) return true
    visiting.add(id)
    for (const edge of edges.filter((item) => item.source === id)) if (!visit(edge.target)) return false
    visiting.delete(id)
    visited.add(id)
    return true
  }
  if (!nodes.every((node) => visit(node.id))) return { ok: false, error: 'AI 修改形成了循环连线。' }
  return { ok: true, nodes, edges }
}

function uniqueEdgeId(edges: ReadonlyArray<WorkflowGraphEdge>, index: number): string {
  let id = `ai-edge-${index}`
  while (edges.some((edge) => edge.id === id)) id += '-new'
  return id
}

function safeConfig(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (typeof value === 'string') return value !== '[redacted]' && value.length <= 16000
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => safeConfig(item, depth + 1))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).every(([key, item]) => !/^(?:__proto__|constructor|prototype|next|nextNodes|branches|defaultNext)$/i.test(key)
      && !/secret|password|api.?key|credential|authorization|private.?key|access.?key/i.test(key) && safeConfig(item, depth + 1))
  }
  return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
}

/** 编辑上下文只包含目录元数据和脱敏后的画布，不上传运行结果。 */
export function buildCanvasEditContext(snapshot: Readonly<WorkflowCopilotSnapshot>, userLocale: string): Record<string, unknown> {
  const context = buildWorkflowCopilotContext('freeform-workflow-question', snapshot)
  return {
    workflow: context.workflow,
    selectedNodeId: snapshot.selectedNodeId ?? null,
    nodes: context.nodes.map((node, index) => ({ ...node, runtime: undefined, position: snapshot.nodes[index].position })),
    edges: context.edges,
    nodeCatalog: snapshot.templates.filter((template) => template.availability?.available !== false).map((template) => ({
      kind: template.kind, label: template.label, description: template.description,
      defaultConfig: redactCopilotValue(template.config), configSchema: template.configSchema,
      inputs: template.inputs, outputs: template.outputs,
    })),
    userLocale,
  }
}
