import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { nodeTemplates } from '@/services/mock/workflowMock'

import { useWorkflowStore } from './workflowStore'

describe('workflow graph history', () => {
  it('undo restores a deleted node and redo removes it again', () => {
    setActivePinia(createPinia())
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const node = store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'start')!, { x: 0, y: 0 })
    store.deleteNode(node.id)

    expect(store.nodes).toHaveLength(0)
    expect(store.undo()).toBe(true)
    expect(store.nodes.map((item) => item.id)).toContain(node.id)
    expect(store.redo()).toBe(true)
    expect(store.nodes).toHaveLength(0)
  })

  it('reset starts a fresh history for a new workflow', () => {
    setActivePinia(createPinia())
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    store.addNodeFromTemplate(nodeTemplates.find((item) => item.kind === 'start')!, { x: 0, y: 0 })
    expect(store.canUndo).toBe(true)
    store.resetToEmptyWorkflow()
    expect(store.canUndo).toBe(false)
  })
})
