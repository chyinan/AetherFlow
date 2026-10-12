import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkflowStore } from './workflowStore'
import { mapBackendDefinitionGraph } from '@/services/api/workflowApi'
import { mapWorkflowToDefinitionDTO } from '@/api/mappers/workflowMapper'

beforeEach(() => setActivePinia(createPinia()))

describe('HTTP 请求工作流往返与重新连接', () => {
  it('加载后保留方法、JSON 配置和成功/失败分支', () => {
    const graph = mapBackendDefinitionGraph([
      { nodeId: 'http', nodeType: 'HTTP_REQUEST', config: {
        method: 'POST', urlVariable: 'endpoint', bodyJson: '{"q":1}', errorStrategy: 'BRANCH',
        outputVariable: 'result', branches: { success: 'next', error: 'recover' }, nextNodes: ['next', 'recover'],
      } },
      { nodeId: 'next', nodeType: 'END', config: {} },
      { nodeId: 'recover', nodeType: 'END', config: {} },
    ])
    expect(graph.nodes[0]?.data.kind).toBe('http-request')
    const result = mapWorkflowToDefinitionDTO({ id: 'test', name: 'HTTP', ...graph })
    expect(result.nodes[0]?.config).toMatchObject({ method: 'POST', bodyJson: '{"q":1}',
      outputVariable: 'result', branches: { success: 'next', error: 'recover' } })
  })

  it('删除成功连接后补回缺失分支，不生成第二条 error', () => {
    const store = useWorkflowStore()
    store.setNodes([{ id: 'http', type: 'workflow', position: { x: 0, y: 0 }, data: {
      kind: 'http-request', label: 'HTTP', description: '', config: { errorStrategy: 'BRANCH' },
      inputs: [], outputs: ['httpResponse'], status: 'idle',
    } }])
    store.setEdges([])
    store.addConnection({ source: 'http', target: 'next', sourceHandle: null, targetHandle: null })
    store.addConnection({ source: 'http', target: 'recover', sourceHandle: null, targetHandle: null })
    expect(store.edges.map((edge) => edge.label)).toEqual(['success', 'error'])
    store.setEdges(store.edges.filter((edge) => edge.label !== 'success'))
    store.addConnection({ source: 'http', target: 'new-next', sourceHandle: null, targetHandle: null })
    expect(store.edges.map((edge) => edge.label)).toEqual(['error', 'success'])
  })
})
