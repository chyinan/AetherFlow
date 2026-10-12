// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
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
    expect(wrapper.emitted('patch')).toEqual([[{ definitionId: 8, definitionVersion: 0 }]])
    expect(wrapper.emitted('update')).toBeUndefined()
    await wrapper.setProps({ config: { definitionId: 8, definitionVersion: 4 } }); await flushPromises()
    await wrapper.get('[data-config-field="definitionId"]').setValue('8')
    expect(wrapper.emitted('patch')).toHaveLength(1)
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
  it.each(['inputMappings', 'outputMappings'])('%s 的撤销和重做配置回传后展示当前已保存映射', async (name) => {
    const original = { text: 'request.original' }
    const edited = { text: 'request.edited' }
    const config = { definitionId: 7, definitionVersion: 2, [name]: original }
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    const draft = '{ "text" : "request.edited" }'
    await field.setValue(draft)
    await wrapper.setProps({ config: { ...config, [name]: edited } })
    expect(field.element.value).toBe(draft)

    await wrapper.setProps({ config: { ...config, [name]: { ...original } } })
    expect(field.element.value).toBe(JSON.stringify(original, null, 2))
    await field.setValue('{')
    await wrapper.setProps({ config: { ...config, [name]: { ...edited } } })
    expect(field.element.value).toBe(JSON.stringify(edited, null, 2))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update')).toEqual([[name, edited]])
  })
  it.each(['inputMappings', 'outputMappings'])('%s 外部替换只清除对应草稿及错误', async (name) => {
    const otherName = name === 'inputMappings' ? 'outputMappings' : 'inputMappings'
    const config = { definitionId: 7, definitionVersion: 2, inputMappings: {}, outputMappings: {} }
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    const otherField = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${otherName}"]`)
    await field.setValue('{')
    await otherField.setValue('{"unfinished":')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(2)

    const replacement = { answer: 'result.answer' }
    await wrapper.setProps({ config: { ...config, [name]: replacement } })
    expect(field.element.value).toBe(JSON.stringify(replacement, null, 2))
    expect(otherField.element.value).toBe('{"unfinished":')
    expect(wrapper.findAll('[role="alert"]')).toHaveLength(1)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it.each(['inputMappings', 'outputMappings'])('%s 的无效草稿在版本更新和等内容配置克隆后保留', async (name) => {
    const config = {
      definitionId: 7,
      definitionVersion: 2,
      inputMappings: { text: 'request.text' },
      outputMappings: { answer: 'result.answer' },
    }
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    await field.setValue('{"unfinished":')
    const previousError = wrapper.get('[role="alert"]').text()

    await wrapper.setProps({ config: { ...JSON.parse(JSON.stringify(config)), definitionVersion: 3 } })
    expect(field.element.value).toBe('{"unfinished":')
    expect(wrapper.get('[role="alert"]').text()).toBe(previousError)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it.each(['inputMappings', 'outputMappings'])('%s 自身有效输入回传保留格式和选区', async (name) => {
    const config = { definitionId: 7, definitionVersion: 2, [name]: {} }
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    for (const draft of ['{ "text" : "request.text" }', '{\n    "text": "request.next"\n}']) {
      await field.setValue(draft)
      field.element.setSelectionRange(4, 9, 'backward')
      await wrapper.setProps({ config: { ...config, [name]: JSON.parse(draft) } })
      expect(field.element.value).toBe(draft)
      expect(field.element.selectionStart).toBe(4)
      expect(field.element.selectionEnd).toBe(9)
      expect(field.element.selectionDirection).toBe('backward')
    }
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update')).toHaveLength(2)
  })
  it.each(['inputMappings', 'outputMappings'])('%s 被外部移除后清除旧草稿和错误', async (name) => {
    const wrapper = render({ definitionId: 7, definitionVersion: 2, [name]: { text: 'request.text' } }); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    await field.setValue('{')
    await wrapper.setProps({ config: { definitionId: 7, definitionVersion: 2 } })
    expect(field.element.value).toBe('{}')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it.each(['inputMappings', 'outputMappings'])('%s 自身保存回传不覆盖较新的无效草稿', async (name) => {
    const original = { text: 'request.original' }
    const saved = { text: 'request.saved' }
    const config = { definitionId: 7, definitionVersion: 2, [name]: original }
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    await field.setValue(JSON.stringify(saved))
    await field.setValue('{"unfinished":')
    await wrapper.setProps({ config: { ...config, [name]: saved } })
    expect(field.element.value).toBe('{"unfinished":')
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)

    await wrapper.setProps({ config: { ...config, [name]: original } })
    expect(field.element.value).toBe(JSON.stringify(original, null, 2))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update')).toEqual([[name, saved]])
  })
  it.each(['inputMappings', 'outputMappings'] as const)('%s 原地外部更新后清除旧草稿和错误', async (name) => {
    const config = reactive({
      definitionId: 7,
      definitionVersion: 2,
      inputMappings: { text: 'request.original' },
      outputMappings: { text: 'result.original' },
    })
    const wrapper = render(config); await flushPromises()
    const field = wrapper.get<HTMLTextAreaElement>(`[data-config-field="${name}"]`)
    await field.setValue('{')
    config[name].text = 'external.updated'
    await flushPromises()
    expect(field.element.value).toBe(JSON.stringify(config[name], null, 2))
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('update')).toBeUndefined()
  })
  it('版本读取失败或组件关闭后不改动已保存配置', async () => {
    const pending = deferred<unknown[]>()
    api.listDefinitionVersions.mockReturnValue(pending.promise)
    const wrapper = render(); wrapper.unmount(); pending.resolve([{ definitionId: 7, version: 99 }]); await flushPromises()
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
