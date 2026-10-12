import { describe, expect, it } from 'vitest'
import { mapWorkflowToDefinitionDTO } from './workflowMapper'
import { defaultMapping } from '@/utils/structuredMapping'
import type { WorkflowDefinition } from '@/types/workflow'
function serialize(config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'workflow', name: '映射', edges: [], nodes: [{ id: 'mapper', type: 'workflow', position: { x: 0, y: 0 }, data: { kind: 'template-transform', label: '映射', description: '', config, inputs: [], outputs: [], status: 'idle' } }] } as WorkflowDefinition).nodes[0]!.config
}
describe('结构化映射持久化契约', () => {
  it('保存完整嵌套映射及原始 JSON 类型，不把数组转成字符串', () => {
    const mapping = { ...defaultMapping(), fields: [{ target: 'detail', type: 'literal', value: { enabled: false, number: 0, values: [null, 'a'] } }] }
    expect(serialize({ transformMode: 'structured', mapping, outputVariable: 'promptList' })).toEqual({ transformMode: 'structured', mapping, outputVariable: 'promptList', nextNodes: [] })
  })
  it('切换模式保存仍保留已配置映射，旧节点默认结构不变', () => {
    expect(serialize({ template: 'hello', outputVariable: 'text' })).toEqual({ template: 'hello', outputVariable: 'text', nextNodes: [] })
    const mapping = defaultMapping()
    expect(serialize({ transformMode: 'text', template: 'hello', outputVariable: 'text', mapping })).toMatchObject({ transformMode: 'text', mapping })
    expect(serialize({ transformMode: 'structured', template: 'hello', mapping })).toMatchObject({ template: 'hello', mapping, outputVariable: 'mappedValue' })
  })
})
