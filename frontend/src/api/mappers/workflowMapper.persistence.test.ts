import { expect, it } from 'vitest'
import { reactive } from 'vue'
import type { WorkflowNodeKind } from '@/types/workflow'
import { mapWorkflowToDefinitionDTO } from './workflowMapper'

function mapConfig(kind: WorkflowNodeKind, config: Record<string, unknown>) {
  return mapWorkflowToDefinitionDTO({ id: 'new', name: '保存契约', edges: [], nodes: [{
    id: 'node', type: 'workflow', position: { x: 0, y: 0 },
    data: { kind, label: '节点', description: '', config, inputs: [], outputs: [], status: 'idle' },
  }] }).nodes[0]!.config!
}
const graph = { '1': { class_type: 'KSampler', inputs: { seed: 123, positive: ['2', 0], enabled: true, empty: null } } }

it.each(['image-generation', 'upscale'] as const)('%s 对象与 JSON 文本均映射为 AI Map 契约并隔离引用', kind => {
  for (const value of [graph, JSON.stringify(graph), reactive(graph)]) {
    const result = mapConfig(kind, { provider: 'COMFYUI', workflowJson: value })
    expect(result.workflowJson).toEqual(graph)
    expect(typeof result.workflowJson).toBe('object')
    expect(result.workflowJson).not.toBe(value)
    expect(JSON.parse(JSON.stringify(result)).workflowJson).toEqual(graph)
  }
})
it.each(['image-generation', 'upscale'] as const)('%s 明确清空执行图保留为空值，与未编辑区分', kind => {
  // 未编辑：字段缺省，保存时省略，回落原图的兼容行为不变。
  for (const value of [undefined, null]) {
    expect(mapConfig(kind, { workflowJson: value })).not.toHaveProperty('workflowJson')
  }
  // 明确清空：保留为空串，预检与保存才能识别，不能悄悄回退原图。
  for (const value of ['', '  ']) {
    expect(mapConfig(kind, { workflowJson: value })).toHaveProperty('workflowJson', '')
  }
})
it.each(['loop', 'iteration'] as const)('%s 递归解除显式嵌套代理，保留顺序和值并隔离引用', kind => {
  const config = reactive({ value: { list: [0, false, null, '中文'] } })
  const bodyNodes = reactive([{ nodeId: 'step-2', config }, { nodeId: 'step-1', config: { empty: [] } }])
  const result = mapConfig(kind, { bodyNodes })
  expect(result.bodyNodes).toEqual(bodyNodes)
  expect(result.bodyNodes).not.toBe(bodyNodes)
  config.value.list[0] = 9
  expect((result.bodyNodes as typeof bodyNodes)[0]!.config).toEqual({ value: { list: [0, false, null, '中文'] } })
  expect(mapConfig(kind, { bodyNodes: reactive([]) }).bodyNodes).toEqual([])
  expect(mapConfig(kind, {})).not.toHaveProperty('bodyNodes')
})
