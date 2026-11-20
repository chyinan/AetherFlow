// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import LoopBodyEditor from './LoopBodyEditor.vue'
const catalog = [{ type: 'WHISPER', displayName: '转写', configSchema: [{ name: 'fileUrlVariable', type: 'STRING', example: 'fileUrl' }] }]

beforeEach(() => { i18n.global.locale.value = 'zh-CN' })
afterEach(() => { i18n.global.locale.value = 'zh-CN' })

function mountEditor(props: { modelValue: unknown; catalog: any[] }) {
  return mount(LoopBodyEditor, { props, global: { plugins: [i18n] } })
}
describe('循环体可视化编辑', () => {
  it('添加转写步骤并默认绑定当前项，支持字段编辑和删除', async () => {
    const wrapper = mountEditor({ modelValue: [], catalog })
    await wrapper.get('[data-test="add-body-node"]').trigger('click')
    const added = wrapper.emitted('update:modelValue')![0]![0] as any[]
    expect(added[0]).toMatchObject({ nodeId: 'step-1', nodeType: 'WHISPER', config: { fileUrlVariable: 'item' } })
    await wrapper.setProps({ modelValue: added })
    await wrapper.get('[aria-label="步骤名称"]').setValue('逐项转写')
    expect((wrapper.emitted('update:modelValue')!.at(-1)![0] as any[])[0].displayName).toBe('逐项转写')
    await wrapper.get('[aria-label="删除步骤"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toEqual([])
  })
  it('重排保留稳定步骤 ID 和配置', async () => {
    const nodes = ['step-1', 'step-2'].map(nodeId => ({ nodeId, nodeType: 'WHISPER', displayName: nodeId, config: { fileUrlVariable: 'item' } }))
    const wrapper = mountEditor({ modelValue: nodes, catalog })
    await wrapper.findAll('[aria-label="下移步骤"]')[0]!.trigger('click')
    expect((wrapper.emitted('update:modelValue')![0]![0] as any[]).map(node => node.nodeId)).toEqual(['step-2', 'step-1'])
    expect(nodes.map(node => node.nodeId)).toEqual(['step-1', 'step-2'])
  })
})

it.each([
  ['WHISPER', { fileUrl: 'https://example.test/audio', fileId: 'old', language: 'auto' }, { fileUrlVariable: 'item', language: 'auto' }],
  ['HTTP_REQUEST', { url: 'https://example.test', bodyJson: '{}', bodyVariable: 'body', method: 'POST', errorStrategy: 'CONTINUE', timeout: 30 }, { urlVariable: 'item', method: 'GET', errorStrategy: 'FAIL', timeout: 30 }],
  ['IMAGE_GENERATION', { prompt: '旧提示词', width: 512 }, { promptVariable: 'item', width: 512 }],
])('响应式 %s 目录深复制后仍使用循环当前项的默认绑定', async (type, exampleConfig, expected) => {
  const { reactive } = await import('vue')
  const original = structuredClone(exampleConfig)
  const wrapper = mountEditor({ modelValue: [], catalog: reactive([{ type, exampleConfig, configSchema: [] }]) })
  await wrapper.get('[aria-label="循环体节点类型"]').setValue(type)
  await wrapper.get('[data-test="add-body-node"]').trigger('click')
  expect(wrapper.emitted('update:modelValue')![0]![0]).toEqual([
    { nodeId: 'step-1', nodeType: type, displayName: type, config: expected },
  ])
  expect(exampleConfig).toEqual(original)
  wrapper.unmount()
})

it('English loop-body labels stay accessible and invalid JSON leaves the existing configuration unchanged', async () => {
  i18n.global.locale.value = 'en-US'
  const nodes = [{ nodeId: 'step-1', nodeType: 'TEMPLATE_TRANSFORM', displayName: 'Transform', config: { transformMode: 'template', mapping: { value: 'item' } } }]
  const catalog = [{ type: 'TEMPLATE_TRANSFORM', displayName: 'Template transform', configSchema: [{ name: 'mapping', type: 'OBJECT' }] }]
  const wrapper = mountEditor({ modelValue: nodes, catalog })

  expect(wrapper.text()).toContain('Loop body · 1 / 100')
  expect(wrapper.text()).toContain('Steps run in order.')
  expect(wrapper.text()).not.toMatch(/[\u3400-\u9fff]/u)
  for (const label of ['Step name', 'Move step up', 'Move step down', 'Delete step', 'Loop body node type']) {
    expect(wrapper.find(`[aria-label="${label}"]`).exists()).toBe(true)
  }
  expect(wrapper.get('[data-test="add-body-node"]').text()).toBe('Add step')

  const mappingInput = wrapper.get('textarea')
  ;(mappingInput.element as HTMLTextAreaElement).value = '{'
  await mappingInput.trigger('change')
  expect(wrapper.get('[role="alert"]').text()).toBe('Enter valid JSON. The existing configuration has not been changed.')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(nodes[0]!.config.mapping).toEqual({ value: 'item' })

  i18n.global.locale.value = 'zh-CN'
  await nextTick()
  expect(wrapper.get('[role="alert"]').text()).toBe('请输入有效 JSON。现有配置尚未更改。')
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('{')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  i18n.global.locale.value = 'en-US'
  await nextTick()
  expect(wrapper.get('[role="alert"]').text()).toBe('Enter valid JSON. The existing configuration has not been changed.')
  expect((mappingInput.element as HTMLTextAreaElement).value).toBe('{')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(nodes[0]!.config.mapping).toEqual({ value: 'item' })

  ;(mappingInput.element as HTMLTextAreaElement).value = '{"value":"fixed"}'
  await mappingInput.trigger('change')
  const updates = wrapper.emitted('update:modelValue')!
  expect(updates).toHaveLength(1)
  expect((updates[0]![0] as any[])[0].config.mapping).toEqual({ value: 'fixed' })
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  await wrapper.setProps({ modelValue: updates[0]![0] })
  expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toContain('fixed')
  expect(nodes[0]!.config.mapping).toEqual({ value: 'item' })
  wrapper.unmount()
})

it('局部切换映射编辑方式后不恢复被隐藏的无效 JSON', async () => {
  const nodes = [{
    nodeId: 'step-1', nodeType: 'TEMPLATE_TRANSFORM', displayName: 'Transform',
    config: { transformMode: 'text', template: 'Hello', mapping: { operation: 'select', sourcePath: 'item' } },
  }]
  const catalog = [{ type: 'TEMPLATE_TRANSFORM', configSchema: [
    { name: 'transformMode', type: 'STRING', options: ['text', 'structured'] },
    { name: 'mapping', type: 'OBJECT' },
  ] }]
  const wrapper = mount(LoopBodyEditor, {
    props: { modelValue: nodes, catalog },
    global: { plugins: [i18n], stubs: { StructuredMappingEditor: true } },
  })
  const input = wrapper.get('textarea')
  ;(input.element as HTMLTextAreaElement).value = '{'
  await input.trigger('change')
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)

  // 使用与 NodeInspector 一样的方式接纳当前组件发出的局部更新。
  const acceptLastUpdate = async () => {
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue')!.at(-1)![0] })
  }
  await wrapper.get('article select').setValue('structured')
  await acceptLastUpdate()
  expect(wrapper.find('textarea').exists()).toBe(false)
  await wrapper.get('article select').setValue('text')
  await acceptLastUpdate()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(JSON.parse((wrapper.get('textarea').element as HTMLTextAreaElement).value)).toEqual(nodes[0]!.config.mapping)
  wrapper.unmount()
})


it.each([
  ['OBJECT', 'true', 'JSON 对象'],
  ['OBJECT', '["left"]', 'JSON 对象'],
  ['ARRAY', '"left"', 'JSON 数组'],
  ['ARRAY', '{"left":1}', 'JSON 数组'],
])('按目录校验 %s 字段的 JSON 顶层类型（%s）', async (fieldType, raw, expectedType) => {
  const configuration = { value: fieldType === 'OBJECT' ? { left: 1 } : ['left'] }
  const nodes = [{ nodeId: 'step-1', nodeType: 'VARIABLE_AGGREGATE', displayName: '聚合', config: configuration }]
  const wrapper = mountEditor({
    modelValue: nodes,
    catalog: [{ type: 'VARIABLE_AGGREGATE', configSchema: [{ name: 'value', type: fieldType }] }],
  })
  const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
  await textarea.setValue(raw)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(textarea.element.value).toBe(raw)
  expect(wrapper.get('[role="alert"]').text()).toContain(expectedType)
  wrapper.unmount()
})

it.each([
  ['VARIABLE_AGGREGATE', 'variables', 'ARRAY', '["left"]', ['left']],
  ['TEMPLATE_TRANSFORM', 'mapping', 'OBJECT', '{"nested":[null,true]}', { nested: [null, true] }],
  ['VARIABLE_AGGREGATE', 'variables', 'ARRAY', '  ', undefined],
  ['TEMPLATE_TRANSFORM', 'mapping', 'OBJECT', 'null', null],
  ['IMAGE_GENERATION', 'workflow', 'OBJECT', JSON.stringify('\uFEFF  {"1":{"class_type":"Example"}}'), '\uFEFF  {"1":{"class_type":"Example"}}'],
])('保留 %s.%s 的原有可提交 JSON 输入：%s %s', async (nodeType, name, type, raw, expected) => {
  const wrapper = mount(LoopBodyEditor, {
    props: {
      modelValue: [{ nodeId: 'step-1', nodeType, displayName: nodeType, config: {} }],
      catalog: [{ type: nodeType, configSchema: [{ name, type }] }],
    },
    global: { plugins: [i18n], stubs: { NodeConnectionSelector: true } },
  })
  await wrapper.get('textarea').setValue(raw)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([
    { nodeId: 'step-1', nodeType, displayName: nodeType, config: { [name]: expected } },
  ])
  wrapper.unmount()
})


it.each(['["item"]', '不是 JSON'])('拒绝不包含 JSON 对象的旧图像工作流文本：%s', async legacyText => {
  const wrapper = mount(LoopBodyEditor, {
    props: {
      modelValue: [{
        nodeId: 'step-1', nodeType: 'IMAGE_GENERATION', displayName: '图像生成',
        config: { workflow: { '1': { class_type: 'Example' } } },
      }],
      catalog: [{ type: 'IMAGE_GENERATION', configSchema: [{ name: 'workflow', type: 'OBJECT' }] }],
    },
    global: { plugins: [i18n], stubs: { NodeConnectionSelector: true } },
  })
  const textarea = wrapper.get<HTMLTextAreaElement>('textarea')
  const raw = JSON.stringify(legacyText)
  await textarea.setValue(raw)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(textarea.element.value).toBe(raw)
  expect(wrapper.get('[role="alert"]').text()).toContain('JSON 对象')
  wrapper.unmount()
})
