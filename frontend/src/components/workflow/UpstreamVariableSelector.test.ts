// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import type { WorkflowGraphNode } from '@/types/workflow'
import UpstreamVariableSelector from './UpstreamVariableSelector.vue'
const node: WorkflowGraphNode = { id: 'asr', type: 'workflow', position: { x: 0, y: 0 }, data: { label: '会议转录', kind: 'whisper', config: {}, inputs: [], outputs: [], status: 'idle', description: '' } }
function render(value = 'transcription') {
  return mount(UpstreamVariableSelector, { props: { nodeId: 'summary', field: 'textVariable', label: '总结输入', modelValue: value, nodes: [node], edges: [{ id: 'link', source: 'asr', target: 'summary' }], expectedType: 'STRING' }, global: { plugins: [i18n] } })
}
describe('统一上游选择器', () => {
  it('展示来源类型并只发出全局变量字符串，挂载不会改写配置', async () => {
    const wrapper = render(); expect(wrapper.text()).toContain('会议转录 (asr)'); expect(wrapper.text()).toContain('STRING')
    expect(wrapper.emitted()).toEqual({})
    await wrapper.get('select').setValue('transcription')
    expect(wrapper.emitted('update:modelValue')).toEqual([['transcription']]); wrapper.unmount()
  })
  it('删除连线后明确失效但不清空已有绑定，撤销连线后恢复来源', async () => {
    const wrapper = render(); await wrapper.setProps({ edges: [] })
    expect(wrapper.text()).toContain('绑定可能已失效'); expect(wrapper.get('input').element.value).toBe('transcription')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ edges: [{ id: 'back', source: 'asr', target: 'summary' }] })
    expect(wrapper.text()).not.toContain('绑定可能已失效'); wrapper.unmount()
  })
  it('高级变量保留旧值并允许编辑，格式错误不会静默替换', async () => {
    const wrapper = render('legacy.value'); expect(wrapper.text()).toContain('服务端契约')
    await wrapper.get('input').setValue('runtimeText')
    expect(wrapper.emitted('update:modelValue')).toEqual([['runtimeText']]); wrapper.unmount()
  })
  it('同名来源显式提醒，固定值与类型不匹配不会被静默清除', async () => {
    const wrapper = render('durationSeconds'); await wrapper.setProps({ nodes: [node, { ...node, id: 'asr2' }], fixedValueActive: true })
    expect(wrapper.text()).toContain('多个写入节点'); expect(wrapper.text()).toContain('固定值优先'); expect(wrapper.text()).toContain('类型与输入期望不一致')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined(); wrapper.unmount()
  })
  it('切换节点后立即替换候选与字段定位，不残留旧来源', async () => {
    const wrapper = render(); await wrapper.setProps({ nodeId: 'other', modelValue: 'external' })
    expect(wrapper.findAll('option')).toHaveLength(1); expect(wrapper.get('input').element.value).toBe('external'); wrapper.unmount()
  })
})
