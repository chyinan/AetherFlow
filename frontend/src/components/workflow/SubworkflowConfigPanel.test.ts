// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ listDefinitions: vi.fn(), listDefinitionVersions: vi.fn() }))
vi.mock('@/api/modules/workflow', () => api)
import SubworkflowConfigPanel from './SubworkflowConfigPanel.vue'
const mounted: ReturnType<typeof mount>[] = []
function render(config: Record<string, unknown> = { definitionId: 7, definitionVersion: 2, inputMappings: {}, outputMappings: {} }) {
  const wrapper = mount(SubworkflowConfigPanel, { props: { config } })
  mounted.push(wrapper)
  return wrapper
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { resolve, promise }
}
beforeEach(() => {
  vi.resetAllMocks()
  api.listDefinitions.mockResolvedValue([{ id: 7, name: 'Reusable' }, { id: 8, name: 'Second' }])
  api.listDefinitionVersions.mockResolvedValue([{ definitionId: 7, version: 3 }, { definitionId: 7, version: 2 }])
})
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()) })
describe('固定版本子流程配置', () => {
  it('打开面板保留旧固定版本，不自动升级到最新版本', async () => {
    const wrapper = render(); await flushPromises()
    expect(wrapper.get<HTMLSelectElement>('[data-config-field="definitionVersion"]').element.value).toBe('2')
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('切换工作流要求重新选择版本；连续重复选择不会清空现有版本', async () => {
    const wrapper = render(); await flushPromises()
    await wrapper.get('[data-config-field="definitionId"]').setValue('8')
    expect(wrapper.emitted('update')).toEqual([['definitionVersion', 0], ['definitionId', 8]])
    await wrapper.setProps({ config: { definitionId: 8, definitionVersion: 4 } }); await flushPromises()
    await wrapper.get('[data-config-field="definitionId"]').setValue('8')
    expect(wrapper.emitted('update')).toHaveLength(2)
  })
  it('拒绝迟到的旧定义版本响应并保留新选择', async () => {
    const old = deferred<unknown[]>(); const next = deferred<unknown[]>()
    api.listDefinitionVersions.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const wrapper = render()
    await wrapper.setProps({ config: { definitionId: 8, definitionVersion: 4 } })
    next.resolve([{ definitionId: 8, version: 4 }]); await flushPromises()
    old.resolve([{ definitionId: 7, version: 99 }]); await flushPromises()
    expect(wrapper.get('[data-config-field="definitionVersion"]').text()).toContain('v4')
    expect(wrapper.get('[data-config-field="definitionVersion"]').text()).not.toContain('v99')
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('无效 JSON 不覆盖已保存映射，修正后保存对象', async () => {
    const wrapper = render(); await flushPromises()
    const field = wrapper.get('[data-config-field="inputMappings"]')
    await field.setValue('{')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.emitted('update')).toBeUndefined()
    await field.setValue('{"text":"request.items[0].text"}')
    expect(wrapper.emitted('update')).toEqual([['inputMappings', { text: 'request.items[0].text' }]])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('版本读取失败或组件关闭后不改动已保存配置', async () => {
    const pending = deferred<unknown[]>()
    api.listDefinitionVersions.mockReturnValue(pending.promise)
    const wrapper = render(); wrapper.unmount(); pending.resolve([{ definitionId: 7, version: 99 }]); await flushPromises()
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
