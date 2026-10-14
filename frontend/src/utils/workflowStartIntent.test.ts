import { expect, it } from 'vitest'
import type { WorkflowDefinition } from '@/types/workflow'
import { workflowStartIntent } from './workflowStartIntent'

function graph(): WorkflowDefinition {
  return {
    id: '101', name: '工作流', backendVersion: 1,
    nodes: ['start', 'prompt', 'end'].map((id) => ({
      id, type: 'workflow', position: { x: 0, y: 0 },
      data: { kind: (id === 'end' ? 'output' : id) as 'start' | 'prompt' | 'output', label: id, description: '', status: 'idle',
        inputs: [], outputs: [], config: id === 'prompt' ? { prompt: '内容', outputVariable: 'text' } : {} },
    })),
    edges: [{ id: 'a', source: 'start', target: 'prompt' }, { id: 'b', source: 'prompt', target: 'end' }],
  }
}

it('实际路由和配置变化会改变意图', () => {
  const workflow = graph()
  const original = workflowStartIntent(workflow)
  workflow.edges[0]!.target = 'end'
  expect(workflowStartIntent(workflow)).not.toBe(original)
  workflow.edges[0]!.target = 'prompt'
  workflow.nodes[1]!.data.config.prompt = '新内容'
  expect(workflowStartIntent(workflow)).not.toBe(original)
})

it('对象属性顺序、节点数组顺序和展示数据不改变意图', () => {
  const workflow = graph()
  workflow.nodes[0]!.data.config.variables = { a: 1, nested: { x: true, y: ['a', 'b'] } }
  const original = workflowStartIntent(workflow)
  workflow.nodes[0]!.data.config.variables = { nested: { y: ['a', 'b'], x: true }, a: 1 }
  expect(workflowStartIntent(workflow)).toBe(original)
  workflow.nodes[0]!.data.config.variables = { a: 2, nested: { x: true, y: ['a', 'b'] } }
  expect(workflowStartIntent(workflow)).not.toBe(original)
  workflow.nodes[0]!.data.config.variables = { nested: { y: ['a', 'b'], x: true }, a: 1 }
  workflow.nodes.reverse()
  workflow.nodes[0]!.selected = true
  workflow.nodes[0]!.position = { x: 500, y: 100 }
  workflow.nodes[0]!.data.label = '新显示名'
  workflow.name = '新名字'
  workflow.backendVersion = 99
  expect(workflowStartIntent(workflow)).toBe(original)
})

it('使用映射后的规范配置识别等价编辑', () => {
  const workflow = graph()
  const original = workflowStartIntent(workflow)
  // START 的 nextNodeIds 来自画布连线，不受过期配置字段影响。
  workflow.nodes[0]!.data.config.nextNodeIds = ['obsolete']
  expect(workflowStartIntent(workflow)).toBe(original)
})

it('实际文件输入属于运行意图', () => {
  expect(workflowStartIntent(graph(), 'file-1')).not.toBe(workflowStartIntent(graph(), 'file-2'))
  expect(workflowStartIntent(graph())).not.toBe(workflowStartIntent(graph(), 'file-1'))
})
