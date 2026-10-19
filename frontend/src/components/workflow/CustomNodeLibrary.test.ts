// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import CustomNodeLibrary from './CustomNodeLibrary.vue'
import CustomNodeConfigPanel from './CustomNodeConfigPanel.vue'
import { CUSTOM_NODE_STORAGE_KEY, customNodeTemplate, defaultCustomDefinition, exportCustomDefinitions } from '@/utils/customNodes'
import { useWorkflowStore } from '@/stores/workflowStore'

const wrappers: Array<ReturnType<typeof mount>> = []
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === text)!
async function click(text: string) { button(text).click(); await flushPromises() }
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0; document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('自定义节点模板库交互', () => {
  it('创建两类模板、可添加 API 节点，模板更新不修改画布快照', async () => {
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    await click('保存模板')
    const store = useWorkflowStore()
    expect(store.customDefinitions.map(item => item.kind)).toEqual(['API'])
    const template = store.templates.find(item => item.config.customDefinition)!
    const node = store.addNodeFromTemplate(template, { x: 0, y: 0 })!
    expect(node.data.outputs).toEqual(['result'])
    await click('新建代码模板'); await click('保存模板')
    expect(store.customDefinitions.map(item => item.kind)).toEqual(['API', 'CODE'])
    expect(node.data.config.customDefinition).toEqual(defaultCustomDefinition('API'))
    expect(JSON.parse(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)!).nodes).toHaveLength(2)
  })
  it('关闭或 Escape 放弃编辑、恢复焦点，重开清空未保存草稿', async () => {
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    const opener = button('自定义节点 · API / 代码'); opener.focus(); opener.click(); await flushPromises()
    const input = [...document.querySelectorAll<HTMLInputElement>('input')].find(element => element.value === 'my-api')!
    input.value = 'unsaved'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
    document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(useWorkflowStore().customDefinitions).toHaveLength(0)
    expect(document.activeElement).toBe(opener)
    opener.click(); await flushPromises()
    expect([...document.querySelectorAll<HTMLInputElement>('input')].some(element => element.value === 'unsaved')).toBe(false)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })
  it('存储失败保留草稿和原列表，修复后可以重新保存', async () => {
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    const mock = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })
    await click('保存模板')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('quota')
    expect(useWorkflowStore().customDefinitions).toEqual([])
    mock.mockRestore(); await click('保存模板')
    expect(useWorkflowStore().customDefinitions).toHaveLength(1)
  })
  it('损坏本机数据不被覆盖，并拒绝不兼容导入包', async () => {
    localStorage.setItem(CUSTOM_NODE_STORAGE_KEY, 'broken')
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    expect(useWorkflowStore().customLibraryError).toContain('原数据保留')
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe('broken')
    const store = useWorkflowStore()
    expect(() => store.saveCustomDefinitions([defaultCustomDefinition()])).toThrow('请先导出原数据')
    expect(() => store.saveCustomDefinitions([{ ...defaultCustomDefinition(), formatVersion: 2 } as never], true)).toThrow('格式版本')
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe('broken')
    store.saveCustomDefinitions([defaultCustomDefinition()], true)
    expect(store.customLibraryError).toBeNull()
  })
  it('恢复的代码模板继承内置节点不可用状态', () => {
    const store = useWorkflowStore()
    store.templates = [{ ...customNodeTemplate(defaultCustomDefinition('CODE')), config: {}, availability: { available: false, reason: '未启用隔离运行时' } }]
    store.saveCustomDefinitions([defaultCustomDefinition('CODE')])
    expect(store.templates.find(template => template.config.customDefinition)?.availability?.available).toBe(false)
    expect(store.addNodeFromTemplate(store.templates[1]!, { x: 0, y: 0 })).toBeNull()
  })
  it('Tab 在已展开的可见控件中环绕，关闭恢复背景滚动', async () => {
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    document.body.style.overflow = 'auto'
    await click('自定义节点 · API / 代码')
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!, first = button('取消 / 关闭'), last = document.querySelector<HTMLElement>('summary')!
    expect(document.body.style.overflow).toBe('hidden')
    last.focus(); dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await flushPromises()
    expect(document.activeElement).toBe(first)
    first.focus(); dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); await flushPromises()
    expect(document.activeElement).toBe(last)
    await click('取消 / 关闭'); expect(document.body.style.overflow).toBe('auto')
  })
  it('支持导出后原样导入', () => {
    const store = useWorkflowStore(), definition = defaultCustomDefinition()
    store.saveCustomDefinitions([definition])
    expect(JSON.parse(exportCustomDefinitions(store.customDefinitions)).nodes).toEqual([definition])
  })
})

describe('自定义节点表单与本地调试', () => {
  it('输入错误后预览失败，修正可恢复且不调用网络或运行代码', async () => {
    const definition = defaultCustomDefinition('CODE'), network = vi.spyOn(globalThis, 'fetch')
    const wrapper = mount(CustomNodeConfigPanel, { props: { config: customNodeTemplate(definition).config } }); wrappers.push(wrapper)
    const response = wrapper.findAll('textarea')[1]!
    await response.setValue('{"wrong":1}')
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.find('[role="alert"]').text()).toContain('必填')
    await response.setValue('{"result":"ok"}'); await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.find('[data-testid="custom-preview"]').text()).toContain('未发送请求或运行代码')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(network).not.toHaveBeenCalled()
  })
})
