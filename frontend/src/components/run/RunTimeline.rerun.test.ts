// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RunTimeline from './RunTimeline.vue'
import { i18n } from '@/i18n'
const nodes = [
  { nodeId: 'failed', label: '失败节点', status: 'failed' as const },
  { nodeId: 'done', label: '已完成节点', status: 'success' as const },
]
describe('运行时间线局部重跑入口', () => {
  it('仅明确允许的失败运行显示失败节点按钮', async () => {
    const wrapper = mount(RunTimeline, { props: { nodes, canRerun: false }, global: { plugins: [i18n] } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    await wrapper.setProps({ canRerun: true })
    expect(wrapper.findAll('button')).toHaveLength(1)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('rerun')).toEqual([[nodes[0]]])
    wrapper.unmount()
  })
  it('作用域失败项提示从循环根重跑，避免提交不支持的叶子重跑', () => {
    const wrapper = mount(RunTimeline, { props: { nodes: [{ nodeId: 'batch/iteration-0/call', label: '失败条目', status: 'failed' }], canRerun: true }, global: { plugins: [i18n] } })
    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.text()).toContain('所属循环根节点')
    wrapper.unmount()
  })

})
