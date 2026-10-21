// @vitest-environment jsdom
// 冷重开后新增节点不能撞上已保存节点的 ID。
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { nodeTemplates } from '@/services/mock/workflowMock'
import type { WorkflowGraphNode } from '@/types/workflow'
import { useWorkflowStore } from './workflowStore'

function node(id: string, kind = 'template-transform'): WorkflowGraphNode {
  const template = nodeTemplates.find((item) => item.kind === kind)!
  return {
    id,
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: { ...template, config: structuredClone(template.config), status: 'idle' },
  }
}

describe('冷重开后的节点 ID', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('重新打开已保存的图后新增同类节点不会复用已有 ID', () => {
    const store = useWorkflowStore()
    store.templates = nodeTemplates
    // 冷重开：图里已经有 node-template-transform-10。
    store.applyWorkflowDefinition({
      id: '201', name: '已有工作流', backendDefinitionId: 201, backendVersion: 3,
      nodes: [node('node-template-transform-10')],
      edges: [{ id: 'edge-1', source: 'node-template-transform-10', target: 'node-template-transform-10' }],
    })
    const template = store.templates.find((item) => item.kind === 'template-transform')!

    const created = store.addNodeFromTemplate(template, { x: 100, y: 100 })

    expect(created).not.toBeNull()
    expect(created!.id).not.toBe('node-template-transform-10')
    expect(store.nodes.map((item) => item.id)).toEqual(['node-template-transform-10', created!.id])
    expect(new Set(store.nodes.map((item) => item.id)).size).toBe(store.nodes.length)
  })

  it('复制节点同样避开已有 ID', () => {
    const store = useWorkflowStore()
    store.templates = nodeTemplates
    store.applyWorkflowDefinition({
      id: '201', name: '已有工作流', backendDefinitionId: 201, backendVersion: 3,
      nodes: [node('node-template-transform-10')],
      edges: [],
    })

    const copy = store.duplicateNode('node-template-transform-10')

    expect(copy).not.toBeNull()
    expect(new Set(store.nodes.map((item) => item.id)).size).toBe(store.nodes.length)
  })

  it('保存并重新打开后继续添加不会与已保存节点冲突', () => {
    const store = useWorkflowStore()
    store.templates = nodeTemplates
    const template = store.templates.find((item) => item.kind === 'template-transform')!
    const first = store.addNodeFromTemplate(template, { x: 0, y: 0 })!

    // 模拟保存后重新加载同一张图。
    const reloaded = useWorkflowStore()
    reloaded.templates = nodeTemplates
    reloaded.applyWorkflowDefinition({
      id: '201', name: '已有工作流', backendDefinitionId: 201, backendVersion: 4,
      nodes: [node(first.id)],
      edges: [],
    })

    const second = reloaded.addNodeFromTemplate(template, { x: 320, y: 0 })!

    expect(second.id).not.toBe(first.id)
    expect(new Set(reloaded.nodes.map((item) => item.id)).size).toBe(reloaded.nodes.length)
  })
})
