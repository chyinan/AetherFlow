import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowGraphEdge } from '@/types/workflow'
import { mapWorkflowToDefinitionDTO } from './workflowMapper'

function workflow(config: Record<string, unknown>, edges: WorkflowGraphEdge[] = []): WorkflowDefinition {
  return {
    id: 'test', name: 'HTTP JSON', nodes: [{
      id: 'http', type: 'workflow', position: { x: 0, y: 0 },
      data: { kind: 'http-request', label: 'HTTP', description: '', config, status: 'idle', inputs: [], outputs: [] },
    }], edges,
  }
}

describe('HTTP 请求映射', () => {
  it('保存方法、原始 JSON、变量和输出设置', () => {
    const result = mapWorkflowToDefinitionDTO(workflow({
      url: 'https://example.com/api', method: 'patch', bodyJson: '{"title":"新标题"}', outputVariable: 'updated',
    }))
    expect(result.nodes[0]).toMatchObject({ nodeType: 'HTTP_REQUEST', config: {
      url: 'https://example.com/api', urlVariable: 'requestUrl', method: 'PATCH',
      bodyJson: '{"title":"新标题"}', errorStrategy: 'FAIL', outputVariable: 'updated', nextNodes: [],
    } })
  })
  it('保留请求体变量并只按明确标签映射分支', () => {
    const result = mapWorkflowToDefinitionDTO(workflow({ method: 'POST', bodyVariable: 'payload', errorStrategy: 'BRANCH' }, [
      { id: 'error', source: 'http', target: 'recover', label: 'error' },
      { id: 'success', source: 'http', target: 'next', label: 'success' },
    ]))
    expect(result.nodes[0]?.config).toMatchObject({ bodyVariable: 'payload', branches: { success: 'next', error: 'recover' } })
    expect(result.nodes[0]?.config).not.toHaveProperty('defaultNext')
  })
  it('不把未标记的出边或缺失错误分支猜测成有效路由', () => {
    const result = mapWorkflowToDefinitionDTO(workflow({ errorStrategy: 'BRANCH' }, [
      { id: 'success', source: 'http', target: 'next', label: 'success' },
      { id: 'other', source: 'http', target: 'unknown' },
    ]))
    expect(result.nodes[0]?.config?.branches).toEqual({ success: 'next' })
  })
  it('拒绝重复分支并在切回终止策略后移除分支路由', () => {
    const edges = [{ id: 'one', source: 'http', target: 'next', label: 'success' },
      { id: 'two', source: 'http', target: 'other', label: 'success' }]
    expect(() => mapWorkflowToDefinitionDTO(workflow({ errorStrategy: 'BRANCH' }, edges))).toThrow('只能连接一个目标')
    const result = mapWorkflowToDefinitionDTO(workflow({ errorStrategy: 'FAIL' }, edges))
    expect(result.nodes[0]?.config).not.toHaveProperty('branches')
  })
})
