// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import type { WorkflowGraphNode } from '@/types/workflow'
import type { WorkflowRun } from '@/types/run'
import WorkflowStarterGuide from './WorkflowStarterGuide.vue'
const node = (id: string, kind: WorkflowGraphNode['data']['kind']): WorkflowGraphNode => ({ id, type: 'workflow', position: { x: 0, y: 0 }, data: { label: id, kind, config: {}, inputs: [], outputs: [], status: 'idle', description: '' } })
function render(nodes = [node('input', 'start'), node('asr', 'whisper'), node('summary', 'summary'), node('export', 'export')]) { return mount(WorkflowStarterGuide, { props: { nodes, run: null, busy: false }, global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' } } } }) }
describe('首跑引导', () => {
  it('示例不冒充运行，输入和Whisper环境均定位已有节点', async () => {
    const wrapper = render(); expect(wrapper.text()).toContain('模板提供示例配置'); expect(wrapper.text()).toContain('尚无当前工作流的真实运行结果')
    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text().includes('打开配置'))!.trigger('click')
    await buttons.find((button) => button.text() === 'asr')!.trigger('click')
    expect(wrapper.emitted('locate')).toEqual([['input', 'fileId'], ['asr', 'whisperEnvironment']])
    expect(wrapper.emitted('run')).toBeUndefined(); wrapper.unmount()
  })
  it('图像引导使用现有连接配置且运行按钮遵守busy', async () => {
    const wrapper = render([node('prompt', 'prompt'), node('image', 'image-generation')]); expect(wrapper.text()).toContain('图像连接助手')
    await wrapper.findAll('button').find((button) => button.text() === 'image')!.trigger('click')
    expect(wrapper.emitted('locate')).toEqual([['image', 'connectionId']])
    await wrapper.setProps({ busy: true }); const start = wrapper.findAll('button').find((button) => button.text() === '开始运行')!
    expect(start.attributes('disabled')).toBeDefined(); await start.trigger('click'); expect(wrapper.emitted('run')).toBeUndefined(); wrapper.unmount()
  })
  it('仅后端终态确认成功，切换工作流清除结果', async () => {
    const wrapper = render(); await wrapper.setProps({ run: { id: 'run-1', status: 'success', backendStatus: 'RUNNING' } as WorkflowRun })
    expect(wrapper.text()).toContain('尚未确认成功'); await wrapper.setProps({ run: { id: 'run-1', status: 'success', backendStatus: 'SUCCESS' } as WorkflowRun })
    expect(wrapper.text()).toContain('后端已确认运行成功'); await wrapper.setProps({ run: null }); expect(wrapper.text()).not.toContain('查看运行结果'); wrapper.unmount()
  })
  it('收起不修改节点、不运行，重新打开仍能准备输入', async () => {
    const wrapper = render(); const before = JSON.stringify(wrapper.props('nodes'))
    await wrapper.findAll('button').find((button) => button.text() === '收起向导')!.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1); expect(JSON.stringify(wrapper.props('nodes'))).toBe(before); expect(wrapper.emitted('run')).toBeUndefined(); wrapper.unmount()
    const reopened = render(); expect(reopened.text()).toContain('1. 准备输入'); reopened.unmount()
  })
})
