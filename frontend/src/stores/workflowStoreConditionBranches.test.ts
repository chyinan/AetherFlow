import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowStore } from './workflowStore'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'

beforeEach(() => setActivePinia(createPinia()))

describe('条件节点分支连线', () => {
  it('删除 true 连线后补线会恢复为 true，保存路由与标签一致', () => {
    const store = useWorkflowStore()
    store.setNodes([{ id: 'condition', type: 'workflow', position: { x: 0, y: 0 }, data: {
      kind: 'condition', label: 'Condition', description: '', config: { trueBranch: 'true', falseBranch: 'false' },
      inputs: [], outputs: ['true', 'false'], status: 'idle',
    } }])
    store.setEdges([])
    store.addConnection({ source: 'condition', target: 'true-target', sourceHandle: null, targetHandle: null })
    store.addConnection({ source: 'condition', target: 'false-target', sourceHandle: null, targetHandle: null })
    store.setEdges(store.edges.filter((edge) => edge.label !== 'true'))

    store.addConnection({ source: 'condition', target: 'new-true-target', sourceHandle: null, targetHandle: null })

    expect(store.edges.map((edge) => edge.label)).toEqual(['false', 'true'])
    const saved = mapWorkflowToDefinitionDTO({ id: 'workflow', name: 'Condition', nodes: store.nodes, edges: store.edges })
    expect(saved.nodes[0]?.config).toMatchObject({
      branches: { true: 'new-true-target', false: 'false-target' },
    })
  })
})
