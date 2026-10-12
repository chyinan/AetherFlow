// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HttpRequestConfigPanel from './HttpRequestConfigPanel.vue'

describe('HTTP 请求配置面板', () => {
  it('提供全部方法、JSON 编辑和明确错误策略', async () => {
    const wrapper = mount(HttpRequestConfigPanel, { props: { config: { method: 'GET' } } })
    expect(wrapper.findAll('[data-config-field="method"] option')).toHaveLength(6)
    await wrapper.get('[data-config-field="method"]').setValue('PATCH')
    await wrapper.get('[data-config-field="bodyJson"]').setValue('{"ok":true}')
    await wrapper.get('[data-config-field="errorStrategy"]').setValue('BRANCH')
    expect(wrapper.emitted('update')).toEqual([['method', 'PATCH'], ['bodyJson', '{"ok":true}'], ['errorStrategy', 'BRANCH']])
    wrapper.unmount()
  })
  it('重新选中节点后重置表单并显示实时配置冲突', async () => {
    const wrapper = mount(HttpRequestConfigPanel, { props: { config: { method: 'POST', bodyJson: 'invalid' } } })
    expect(wrapper.get('[role="alert"]').text()).toContain('有效 JSON')
    await wrapper.setProps({ config: { method: 'POST', bodyJson: '{}', bodyVariable: 'payload' } })
    expect(wrapper.get('[role="alert"]').text()).toContain('只能选择一个')
    await wrapper.setProps({ config: { method: 'HEAD', bodyJson: '{}' } })
    expect(wrapper.get('[role="alert"]').text()).toContain('不支持请求体')
    await wrapper.setProps({ config: { method: 'POST', errorStrategy: 'BRANCH' } })
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect((wrapper.get('[data-config-field="bodyJson"]').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.text()).toContain('success 和 error')
    wrapper.unmount()
  })
})
