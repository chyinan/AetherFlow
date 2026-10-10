// pattern: Imperative Shell
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useWorkflowStore } from '@/stores/workflowStore'
import { nodeTemplates } from '@/services/mock/workflowMock'
import type { CopilotCanvasEdit } from '@/types/copilotCanvasEdit'
import { buildCanvasEditContext, compileCanvasEdit } from './copilotCanvasEdit'

function snapshot() {
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
})
