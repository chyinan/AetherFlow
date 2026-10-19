// pattern: Imperative Shell
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import { customNodeTemplate, defaultCustomDefinition } from '@/utils/customNodes'
import type { WorkflowCopilotSnapshot } from './workflowCopilotActions'
import { buildCanvasEditContext, compileCanvasEdit } from './copilotCanvasEdit'

function snapshot(): WorkflowCopilotSnapshot {
  return {
    workflowId: 'new', workflowName: '测试流程', nodes: [], edges: [],
    templates: nodeTemplates.map((template) => ({ ...template, availability: { available: true, reason: null } })),
  }
}

const creation: CopilotCanvasEdit = {
  status: 'READY', explanation: '创建开始、LLM 和输出。', operations: [
    { type: 'add_node', nodeId: 'begin', kind: 'start' },
    { type: 'add_node', nodeId: 'model', kind: 'llm', config: { prompt: '用中文回答', temperature: 0.2 } },
    { type: 'add_node', nodeId: 'end', kind: 'output' },
    { type: 'connect', source: 'begin', target: 'model' },
    { type: 'connect', source: 'model', target: 'end', label: 'completionText' },
  ],
}

describe('AI canvas edit', () => {
  it('applies a batch atomically and undo/redo restores the whole graph', () => {
    setActivePinia(createPinia())
    const store = useWorkflowStore()
    store.templates = snapshot().templates
    const graph = compileCanvasEdit(snapshot(), creation)
    expect(graph.ok).toBe(true)
    if (!graph.ok) return
    const request = { baseWorkflowId: store.workflowId, baseEditRevision: store.editRevision,
      baseDefinitionId: null, baseVersion: null, nodes: graph.nodes, edges: graph.edges }
    expect(store.applyCopilotWorkflowDraft(request)).toBe(true)
    expect(store.nodes).toHaveLength(3)
    expect(store.edges).toHaveLength(2)
    expect(store.historyPast).toHaveLength(1)
    expect(store.applyCopilotWorkflowDraft(request)).toBe(false)
    store.undo()
    expect(store.nodes).toHaveLength(0)
    store.redo()
    expect(store.nodes.find((node) => node.id === 'model')?.data.config.prompt).toBe('用中文回答')
  })

  it('updates, disconnects and deletes without mutating the input graph', () => {
    const initial = compileCanvasEdit(snapshot(), creation)
    if (!initial.ok) throw new Error(initial.error)
    const base = { ...snapshot(), ...initial }
    const result = compileCanvasEdit(base, { status: 'READY', explanation: '修改', operations: [
      { type: 'update_node', nodeId: 'model', label: '中文助手', config: { temperature: 0.7 } },
      { type: 'disconnect', source: 'model', target: 'end' },
      { type: 'delete_node', nodeId: 'end' },
    ] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(1)
    expect(result.nodes[1].data.config.prompt).toBe('用中文回答')
    expect(result.nodes[1].data.config.temperature).toBe(0.7)
    expect(base.nodes[1].data.config.temperature).toBe(0.2)
    expect(base.edges).toHaveLength(2)
  })

  it.each([
    { type: 'connect', source: 'model', target: 'begin' },
    { type: 'connect', source: 'model', target: 'missing' },
    { type: 'connect', source: 'begin', target: 'model' },
    { type: 'update_node', nodeId: 'missing', config: { prompt: 'x' } },
    { type: 'update_node', nodeId: 'model', config: { apiKey: 'secret' } },
    { type: 'update_node', nodeId: 'model', config: { nextNodes: ['end'] } },
    { type: 'update_node', nodeId: 'model', config: { prompt: '[redacted]' } },
    { type: 'delete_node', nodeId: 'begin' },
  ] as CopilotCanvasEdit['operations'])('rejects invalid operations without a partial edit: %j', (operation) => {
    const base = compileCanvasEdit(snapshot(), creation)
    if (!base.ok) throw new Error(base.error)
    const result = compileCanvasEdit({ ...snapshot(), ...base }, {
      status: 'READY', explanation: '非法修改', operations: [operation],
    })
    expect(result.ok).toBe(false)
    expect(base.nodes).toHaveLength(3)
    expect(base.edges).toHaveLength(2)
  })

  it('rejects unavailable kinds and redacts credentials from model context', () => {
    const base = snapshot()
    base.templates[0].config = { apiKey: 'private-key', prompt: 'safe' }
    const context = JSON.stringify(buildCanvasEditContext(base, 'zh-CN'))
    expect(context).not.toContain('private-key')
    const result = compileCanvasEdit({ ...base, templates: [] }, creation)
    expect(result.ok).toBe(false)
  })

  it('普通新增按类型只选择内置模板，绝不回退到同类型自定义模板', () => {
    const base = snapshot(), definition = defaultCustomDefinition()
    const custom = customNodeTemplate(definition)
    base.templates.unshift({ ...custom, availability: { available: true, reason: null } })
    const edit: CopilotCanvasEdit = { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'request', kind: 'http-request' },
    ] }
    const result = compileCanvasEdit(base, edit)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.nodes[1]!.data.config.customDefinition).toBeUndefined()
    base.templates = base.templates.filter((item) => item.kind !== 'http-request' || Boolean(item.config.customDefinition))
    expect(compileCanvasEdit(base, edit).ok).toBe(false)
  })

  it('精确选择自定义模板 ID 和版本，CODE 只成为未运行草稿并保留不可用能力', () => {
    const base = snapshot(), definition = defaultCustomDefinition('CODE')
    const newer = { ...definition, version: '2.0.0', code: 'def main(payload):\n    return {"result": "new"}' }
    const unavailable = { ...base.templates.find((template) => template.kind === 'code')!, availability: { available: false, reason: 'Python 未启用' } }
    base.templates.push({ ...customNodeTemplate(newer, unavailable), availability: unavailable.availability },
      { ...customNodeTemplate(definition, unavailable), availability: unavailable.availability })
    const result = compileCanvasEdit(base, { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'custom', kind: 'code', customNodeId: definition.id, customNodeVersion: '1.0.0' },
    ] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    const node = result.nodes[1]!
    expect(node.data.config.customDefinition).toEqual(definition)
    expect(node.data.config.customDefinition).not.toBe(definition)
    expect(node.data).toHaveProperty('availability', unavailable.availability)
    expect(node.data.status).toBe('idle')
    expect(node.data.runtime?.lastResult).toContain('尚未运行')
  })

  it.each([
    { customNodeId: 'my-code' },
    { customNodeVersion: '1.0.0' },
    { customNodeId: 'my-code', customNodeVersion: '2.0.0' },
    { customNodeId: 'my-code', customNodeVersion: '1.0.0', kind: 'http-request' },
  ])('拒绝不完整、缺失或类型不符的模板引用：%j', (reference) => {
    const base = snapshot(), definition = defaultCustomDefinition('CODE')
    base.templates.push({ ...customNodeTemplate(definition), availability: { available: false, reason: 'Python 未启用' } })
    expect(compileCanvasEdit(base, { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'custom', kind: 'code', ...reference },
    ] }).ok).toBe(false)
  })

  it('创建和修改定义都不能绕过草稿确认', () => {
    const definition = defaultCustomDefinition()
    expect(compileCanvasEdit(snapshot(), { ...creation, operations: [
      { type: 'create_custom_node', draftId: 'draft', definition },
    ] }).ok).toBe(false)
    expect(compileCanvasEdit(snapshot(), { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'custom', kind: 'http-request', config: { customDefinition: definition } },
    ] }).ok).toBe(false)
    const existing = compileCanvasEdit(snapshot(), creation)
    if (!existing.ok) throw new Error(existing.error)
    expect(compileCanvasEdit({ ...snapshot(), ...existing }, { ...creation, operations: [
      { type: 'update_node', nodeId: 'model', config: { customDefinition: definition } },
    ] }).ok).toBe(false)
  })

  it('精确模板身份有多个候选时拒绝，不任意选取第一项', () => {
    const base = snapshot(), definition = defaultCustomDefinition('CODE'), template = customNodeTemplate(definition)
    base.templates.push(template, { ...template })
    expect(compileCanvasEdit(base, { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'custom', kind: 'code', customNodeId: definition.id, customNodeVersion: definition.version },
    ] }).ok).toBe(false)
  })

  it('不可用 API 模板不会因为精确引用而绕过能力校验', () => {
    const base = snapshot(), definition = defaultCustomDefinition()
    base.templates.push({ ...customNodeTemplate(definition), availability: { available: false, reason: 'API 能力不可用' } })
    expect(compileCanvasEdit(base, { ...creation, operations: [
      { type: 'add_node', nodeId: 'begin', kind: 'start' },
      { type: 'add_node', nodeId: 'custom', kind: 'http-request', customNodeId: definition.id, customNodeVersion: definition.version },
    ] }).ok).toBe(false)
  })

  it('向模型只提供自定义目录的精确标识和能力，不发送模板代码或请求头', () => {
    const base = snapshot(), code = defaultCustomDefinition('CODE'), api = defaultCustomDefinition()
    code.code = 'def main(payload):\n    return {"result": "never-upload-this-code"}'
    api.request!.headers = { Authorization: 'never-upload-this-header' }
    base.templates.push({ ...customNodeTemplate(code), availability: { available: false, reason: 'Python 未启用' } },
      { ...customNodeTemplate(api), availability: { available: true, reason: null } })
    const context = buildCanvasEditContext(base, 'zh-CN')
    expect(context.capabilities).toEqual({ customNodeDrafts: true })
    expect(context.customNodeCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ customNodeId: code.id, customNodeVersion: '1.0.0', availability: { available: false, reason: 'Python 未启用' } }),
      expect.objectContaining({ customNodeId: api.id, customNodeVersion: '1.0.0' }),
    ]))
    expect(JSON.stringify(context)).not.toContain('never-upload-this')
    expect(JSON.stringify(context.nodeCatalog)).not.toContain('customDefinition')
  })
})
