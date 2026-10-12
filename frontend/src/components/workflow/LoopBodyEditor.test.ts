// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LoopBodyEditor from './LoopBodyEditor.vue'
const catalog = [{ type: 'WHISPER', displayName: '转写', configSchema: [{ name: 'fileUrlVariable', type: 'STRING', example: 'fileUrl' }] }]
describe('循环体可视化编辑', () => {
  it('添加转写步骤并默认绑定当前项，支持字段编辑和删除', async () => {
    const wrapper = mount(LoopBodyEditor, { props: { modelValue: [], catalog } })
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
    const wrapper = mount(LoopBodyEditor, { props: { modelValue: nodes, catalog } })
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
  const wrapper = mount(LoopBodyEditor, {
    props: { modelValue: [], catalog: reactive([{ type, exampleConfig, configSchema: [] }]) },
  })
  await wrapper.get('[aria-label="循环体节点类型"]').setValue(type)
  await wrapper.get('[data-test="add-body-node"]').trigger('click')
  expect(wrapper.emitted('update:modelValue')![0]![0]).toEqual([
    { nodeId: 'step-1', nodeType: type, displayName: type, config: expected },
  ])
  expect(exampleConfig).toEqual(original)
  wrapper.unmount()
})
