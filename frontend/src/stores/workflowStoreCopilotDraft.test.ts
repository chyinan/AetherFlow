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
import type { WorkflowGraphNode } from '@/types/workflow'
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
})
