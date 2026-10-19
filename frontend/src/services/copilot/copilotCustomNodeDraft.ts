// pattern: Functional Core
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import {
  customDefinitionKey, customNodeTemplate, mergeCustomDefinitions, parseCustomDefinition, type CustomDefinition,
} from '@/utils/customNodes'
import { compileCanvasEdit } from './copilotCanvasEdit'
import type { WorkflowCopilotSnapshot } from './workflowCopilotActions'

export type PreparedCopilotCustomNodeDraft = {
  definitions: CustomDefinition[]
  canvasEdit: CopilotCanvasEdit | null
  previewGraph: { nodes: WorkflowGraphNode[]; edges: WorkflowGraphEdge[] } | null
}

export type CopilotCustomNodeDraftResult =
  | ({ ok: true } & PreparedCopilotCustomNodeDraft)
  | { ok: false; error: string }

export function hasCustomNodeDraftOperations(edit: Readonly<CopilotCanvasEdit>): boolean {
  return Array.isArray(edit.operations) && edit.operations.some((operation) => operation?.type === 'create_custom_node')
}

/** 只校验和预览；保存库、提交画布与取消均由确认界面负责。 */
export function prepareCustomNodeDraft(
  edit: Readonly<CopilotCanvasEdit>, snapshot: Readonly<WorkflowCopilotSnapshot>,
): CopilotCustomNodeDraftResult {
  if (edit.status !== 'READY' || !Array.isArray(edit.operations) || !hasCustomNodeDraftOperations(edit)
    || edit.operations.length > 80) return { ok: false, error: 'AI 未返回可预览的自定义节点草稿。' }

  try {
    const definitions: CustomDefinition[] = []
    const draftIds = new Set<string>()
    const keys = new Set<string>()
    for (const operation of edit.operations) {
      if (!operation || typeof operation !== 'object') throw new Error('AI 返回了无效的草稿操作。')
      if (operation.type !== 'create_custom_node') continue
      if (typeof operation.draftId !== 'string' || !/^[\w-]{1,100}$/.test(operation.draftId) || draftIds.has(operation.draftId)) {
        throw new Error('自定义节点草稿 ID 无效或重复。')
      }
      if (Object.keys(operation).some((key) => !['type', 'draftId', 'definition'].includes(key))) {
        throw new Error('创建草稿操作包含不支持的字段。')
      }
      assertSafeDefinition(operation.definition)
      const definition = parseCustomDefinition(operation.definition)
      const key = customDefinitionKey(definition)
      if (keys.has(key)) throw new Error(`草稿包含重复的模板 ID 和版本：${key}`)
      draftIds.add(operation.draftId)
      keys.add(key)
      definitions.push(definition)
    }

    // 预览时即检测本机同版本冲突；真正写入仍由模板库在锁内再次校验。
    const existing = snapshot.templates.filter((template) => template.config.customDefinition)
      .map((template) => parseCustomDefinition(template.config.customDefinition))
    const merged = mergeCustomDefinitions(existing, definitions)
    const builtin = snapshot.templates.filter((template) => !template.config.customDefinition)
    const templates = [...builtin, ...merged.map((definition) => customNodeTemplate(definition,
      builtin.find((template) => template.kind === (definition.kind === 'API' ? 'http-request' : 'code'))))]
    const operations = edit.operations.filter((operation) => operation.type !== 'create_custom_node')
    if (operations.length === 0) return { ok: true, definitions, canvasEdit: null, previewGraph: null }

    const canvasEdit: CopilotCanvasEdit = JSON.parse(JSON.stringify({ ...edit, operations }))
    const graph = compileCanvasEdit({ ...snapshot, templates }, canvasEdit)
    if (!graph.ok) return graph
    return { ok: true, definitions, canvasEdit, previewGraph: { nodes: graph.nodes, edges: graph.edges } }
  } catch (error) {
    return { ok: false, error: `自定义节点草稿无效：${error instanceof Error ? error.message : String(error)}` }
  }
}

/** 模型返回值只能是普通 JSON 数据，不能把原型字段或脱敏占位内容写进模板。 */
function assertSafeDefinition(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error('草稿嵌套层级过深。')
  if (typeof value === 'string') {
    if (value.includes('[redacted]')) throw new Error('草稿包含脱敏占位内容，请重新生成。')
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeDefinition(item, depth + 1)
    return
  }
  if (value !== null && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('草稿必须为 JSON 对象。')
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:__proto__|constructor|prototype)$/i.test(key)) throw new Error('草稿包含不允许的原型字段。')
      assertSafeDefinition(item, depth + 1)
    }
    return
  }
  if (value !== null && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('草稿包含非 JSON 数据。')
  }
}
