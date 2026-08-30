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
    expect(node).not.toBeNull()
    if (!node) {
      throw new Error('start node should be available in a fresh workflow')
    }
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

  it('does not duplicate a node whose current runtime capability is unavailable', () => {
    setActivePinia(createPinia())
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const llmTemplate = nodeTemplates.find((item) => item.kind === 'llm')!
    const node = store.addNodeFromTemplate(llmTemplate, { x: 0, y: 0 })
    expect(node).not.toBeNull()
    if (!node) throw new Error('llm node should be created before the capability changes')
    store.templates = store.templates.map((template) => template.kind === 'llm'
      ? { ...template, availability: { available: false, reason: 'llm runtime is disabled' } }
      : template)

    expect(store.duplicateNode(node.id)).toBeNull()
    expect(store.nodes).toHaveLength(1)
    expect(store.runError).toContain('llm runtime is disabled')
  })

  it('duplicates an available reactive node with an independent config snapshot', () => {
    setActivePinia(createPinia())
    const store = useWorkflowStore()
    store.resetToEmptyWorkflow()
    const conditionTemplate = nodeTemplates.find((item) => item.kind === 'condition')!
    const source = store.addNodeFromTemplate(conditionTemplate, { x: 0, y: 0 })
    expect(source).not.toBeNull()
    if (!source) throw new Error('condition node should be available')

    const duplicate = store.duplicateNode(source.id)

    expect(duplicate).not.toBeNull()
    expect(duplicate?.data.config).toEqual(source.data.config)
    expect(duplicate?.data.config).not.toBe(source.data.config)
  })
})
