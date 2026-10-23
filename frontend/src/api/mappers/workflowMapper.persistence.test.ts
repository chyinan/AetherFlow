import { describe, expect, it } from 'vitest'
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
describe('UPSCALE ComfyUI 源图绑定保存兼容', () => {
  const topLevel = [{ nodeId: '4', inputName: 'image', parameter: 'sourceImage' }]
  const nested = [{ nodeId: '9', inputName: 'pixels', parameter: 'sourceImage' }]

  it('保存顶层绑定时保留绑定，并同步兼容 options 格式', () => {
    const result = mapConfig('upscale', { workflowJson: graph, workflowBindings: topLevel })

    expect(result.workflowBindings).toEqual(topLevel)
    expect(result.options).toMatchObject({ workflowBindings: topLevel })
  })

  it('旧 options.workflowBindings 会规范化到顶层与兼容字段', () => {
    const result = mapConfig('upscale', { workflowJson: graph, options: { workflowBindings: nested, keep: true } })

    expect(result.workflowBindings).toEqual(nested)
    expect(result.options).toEqual({ workflowBindings: nested, keep: true })
  })

  it('新顶层绑定优先于冲突的旧嵌套绑定', () => {
    const result = mapConfig('upscale', {
      workflowJson: graph,
      workflowBindings: topLevel,
      options: { workflowBindings: nested, keep: true },
    })

    expect(result.workflowBindings).toEqual(topLevel)
    expect(result.options).toEqual({ workflowBindings: topLevel, keep: true })
  })

  it('默认 UPSCALE 配置不凭空创建绑定', () => {
    const result = mapConfig('upscale', {})

    expect(result).not.toHaveProperty('workflowBindings')
    expect(result).not.toHaveProperty('options')
  })
})
describe('VARIABLE_ASSIGNER 显式 JSON 值保存', () => {
  it.each([
    ['空字符串', ''],
    ['数字', 0],
    ['布尔值', false],
    ['对象', { nested: { ready: true } }],
    ['数组', []],
    ['null', null],
  ])('保存 %s 字面值并在重映射后保留原类型', (_label, value) => {
    const config = mapConfig('variable-assigner', {
      variable: 'result', valueMode: 'LITERAL', valueType: 'JSON', value,
    })

    expect(config).toMatchObject({ variable: 'result', valueMode: 'LITERAL', valueType: 'JSON' })
    expect(config).toHaveProperty('value', value)
    expect(JSON.parse(JSON.stringify(config))).toHaveProperty('value', value)
  })

  it('保存 STRING 字面值时保留空字符串', () => {
    expect(mapConfig('variable-assigner', {
      variable: 'result', valueMode: 'LITERAL', valueType: 'STRING', value: '',
    })).toMatchObject({ valueMode: 'LITERAL', valueType: 'STRING', value: '' })
  })

  it('保存 JSON 编辑错误时拒绝序列化未解析文本', () => {
    expect(() => mapConfig('variable-assigner', {
      variable: 'result', valueMode: 'LITERAL', valueType: 'JSON',
      valueJsonText: '{broken', valueValidationError: 'invalid JSON',
    })).toThrow('VARIABLE_ASSIGNER value must be valid JSON')
  })
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
