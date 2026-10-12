import { reactive, toRaw } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkflow, saveWorkflow } = vi.hoisted(() => ({
  getWorkflow: vi.fn(),
  saveWorkflow: vi.fn(),
}))

vi.mock('@/services/api/workflowApi', () => ({
  getBackendDefinitionId: vi.fn(() => null),
  workflowApi: { getWorkflow, saveWorkflow },
}))

import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowGraphEdge, WorkflowGraphNode } from '@/types/workflow'
import { useWorkflowStore } from './workflowStore'

function startNode(id: string, x = 0): WorkflowGraphNode {
  const template = nodeTemplates.find((item) => item.kind === 'start')!
  return {
    id,
    type: 'workflow',
    position: { x, y: 0 },
    data: { ...template, config: structuredClone(template.config), status: 'idle' },
  }
}

describe('Copilot draft revision guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getWorkflow.mockReset()
    saveWorkflow.mockReset()
  })

  it('keeps the backend version after route load and sends it on save', async () => {
    getWorkflow.mockResolvedValue({
      id: '12', name: 'Existing workflow', backendDefinitionId: 12, backendVersion: 7,
      nodes: [startNode('start-1')], edges: [],
    })
    saveWorkflow.mockResolvedValue({
      id: '12', name: 'Existing workflow', backendDefinitionId: 12, backendVersion: 8,
      nodes: [startNode('start-1')], edges: [],
    })
    const store = useWorkflowStore()

    await expect(store.loadWorkflow('12')).resolves.toBe(true)
    expect(store.backendVersion).toBe(7)
    await store.saveCurrentWorkflow()
    expect(saveWorkflow).toHaveBeenCalledWith(expect.objectContaining({ backendVersion: 7 }), expect.anything())
    expect(store.backendVersion).toBe(8)
  })

  it('atomically applies only a current, unique-start draft and leaves one undo snapshot', () => {
    const store = useWorkflowStore()
    store.applyWorkflowDefinition({
      id: 'workflow-1', name: 'Existing workflow', backendDefinitionId: 12, backendVersion: 4,
      nodes: [startNode('old-start')], edges: [],
    })
    const request = {
      baseWorkflowId: store.workflowId,
      baseEditRevision: store.editRevision,
      baseDefinitionId: store.backendDefinitionId,
      baseVersion: store.backendVersion,
      nodes: [startNode('new-start', 100)],
      edges: [],
    }

    expect(store.applyCopilotWorkflowDraft(request)).toBe(true)
    expect(store.nodes.map((node) => node.id)).toEqual(['new-start'])
    expect(store.dirty).toBe(true)
    expect(store.historyPast).toHaveLength(1)
    expect(store.applyCopilotWorkflowDraft(request)).toBe(false)
    expect(store.nodes.map((node) => node.id)).toEqual(['new-start'])
  })

  it('rejects a stale revision, duplicate START, or unavailable node capability without changing the graph', () => {
    const store = useWorkflowStore()
    store.applyWorkflowDefinition({
      id: 'workflow-1', name: 'Existing workflow', backendDefinitionId: 12, backendVersion: 4,
      nodes: [startNode('old-start')], edges: [],
    })
    const base = {
      baseWorkflowId: store.workflowId,
      baseEditRevision: store.editRevision,
      baseDefinitionId: store.backendDefinitionId,
      baseVersion: store.backendVersion,
      edges: [],
    }
    const originalIds = store.nodes.map((node) => node.id)
    expect(store.applyCopilotWorkflowDraft({ ...base, baseEditRevision: base.baseEditRevision + 1, nodes: [startNode('new')] })).toBe(false)
    expect(store.applyCopilotWorkflowDraft({ ...base, nodes: [startNode('new-1'), startNode('new-2')] })).toBe(false)
    store.templates = store.templates.map((template) => template.kind === 'summary'
      ? { ...template, availability: { available: false, reason: 'summary runtime unavailable' } }
      : template)
    expect(store.applyCopilotWorkflowDraft({
      ...base,
      nodes: [startNode('new-start'), {
        id: 'summary', type: 'workflow', position: { x: 300, y: 0 },
        data: { ...nodeTemplates.find((item) => item.kind === 'summary')!, config: {}, status: 'idle' },
      }],
    })).toBe(false)
    expect(store.nodes.map((node) => node.id)).toEqual(originalIds)
  })

  it('keeps redo history when Vue Flow echoes unchanged edges after undo', () => {
    const store = useWorkflowStore()
    store.applyWorkflowDefinition({ id: 'new', name: 'Draft', nodes: [startNode('start')], edges: [] })
    const request = { baseWorkflowId: store.workflowId, baseEditRevision: store.editRevision,
      baseDefinitionId: null, baseVersion: null, nodes: [startNode('replacement')], edges: [] }
    store.applyCopilotWorkflowDraft(request)
    store.undo()
    expect(store.canRedo).toBe(true)
    store.setEdges([...store.edges])
    expect(store.canRedo).toBe(true)
    expect(store.redo()).toBe(true)
    expect(store.nodes[0].id).toBe('replacement')
  })
})


describe('Copilot 代理图克隆与失败原子性', () => {
  beforeEach(() => setActivePinia(createPinia()))

  function setupDraft() {
    const store = useWorkflowStore()
    store.applyWorkflowDefinition({
      id: 'draft', name: '原画布', nodes: [startNode('original')], edges: [],
    })
    const request = () => ({
      baseWorkflowId: store.workflowId,
      baseEditRevision: store.editRevision,
      baseDefinitionId: store.backendDefinitionId,
      baseVersion: store.backendVersion,
      nodes: [startNode('replacement')],
      edges: [] as WorkflowGraphEdge[],
    })
    return { store, request }
  }

  it('解除数组和显式嵌套代理，保留克隆类型、循环和跨节点边共享关系', () => {
    const { store, request } = setupDraft()
    const shared = reactive({ value: 1 })
    const cycle: Record<string, unknown> = { shared }
    cycle.self = cycle
    const config = reactive({
      shared, cycle, date: new Date('2026-10-12T00:00:00Z'),
      map: new Map([['key', 3]]), set: new Set([4]), bytes: new Uint8Array([5, 6]),
    })
    const draft = request()
    draft.nodes[0]!.data.config = config
    const edge: WorkflowGraphEdge & { data: { shared: typeof shared } } = {
      id: 'edge', source: 'replacement', target: 'replacement', data: { shared },
    }
    draft.edges = [edge]
    expect(store.applyCopilotWorkflowDraft(reactive(draft))).toBe(true)
    const cloned = toRaw(store.nodes[0]!.data.config) as typeof config
    expect(cloned.date).toEqual(config.date)
    expect(cloned.map).toEqual(config.map)
    expect(cloned.set).toEqual(config.set)
    expect(cloned.bytes).toEqual(config.bytes)
    expect(cloned.cycle.self).toBe(cloned.cycle)
    expect(cloned.cycle.shared).toBe(cloned.shared)
    expect(toRaw((store.edges[0]! as typeof edge).data).shared).toBe(cloned.shared)
    shared.value = 99
    expect(cloned.shared.value).toBe(1)
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]!.id).toBe('original')
    expect(store.redo()).toBe(true)
    expect(store.nodes[0]!.id).toBe('replacement')
  })

  it.each(['nodes', 'edges'] as const)('%s 不可克隆时保留全部状态和重做历史，随后可恢复应用', (part) => {
    const { store, request } = setupDraft()
    expect(store.applyCopilotWorkflowDraft(request())).toBe(true)
    expect(store.undo()).toBe(true)
    const before = structuredClone(toRaw(store.$state))
    const draft = request()
    if (part === 'nodes') draft.nodes[0]!.data.config = { unsupported: () => undefined }
    else {
      const edge = { id: 'edge', source: 'replacement', target: 'replacement', unsupported: () => undefined }
      draft.edges = [edge]
    }
    expect(() => store.applyCopilotWorkflowDraft(draft)).toThrow()
    expect(store.$state).toEqual(before)
    expect(store.canRedo).toBe(true)
    expect(store.redo()).toBe(true)
    expect(store.undo()).toBe(true)
    expect(store.applyCopilotWorkflowDraft(request())).toBe(true)
    expect(store.nodes[0]!.id).toBe('replacement')
    expect(store.historyPast).toHaveLength(1)
    expect(store.historyFuture).toHaveLength(0)
  })
})
