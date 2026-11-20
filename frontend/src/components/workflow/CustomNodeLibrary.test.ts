// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import CustomNodeLibrary from './CustomNodeLibrary.vue'
import CustomNodeConfigPanel from './CustomNodeConfigPanel.vue'
import { CUSTOM_NODE_STORAGE_KEY, customNodeTemplate, defaultCustomDefinition, exportCustomDefinitions } from '@/utils/customNodes'
import { useWorkflowStore } from '@/stores/workflowStore'
import { installCustomNodeLockHarness } from '@/test/customNodeLockHarness'

const wrappers: Array<ReturnType<typeof mount>> = []
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === text)!
async function click(text: string) { button(text).click(); await flushPromises() }
let lockHarness: ReturnType<typeof installCustomNodeLockHarness>
beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); lockHarness = installCustomNodeLockHarness() })
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers.length = 0; document.body.innerHTML = ''; lockHarness.restore(); vi.restoreAllMocks() })

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
    await expect(store.saveCustomDefinitions([defaultCustomDefinition()])).rejects.toThrow('请先导出原数据')
    await expect(store.saveCustomDefinitions([{ ...defaultCustomDefinition(), formatVersion: 2 } as never], true)).rejects.toThrow('格式版本')
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe('broken')
    await store.saveCustomDefinitions([defaultCustomDefinition()], true)
    expect(store.customLibraryError).toBeNull()
  })
  it('恢复的代码模板继承内置节点不可用状态', async () => {
    const store = useWorkflowStore()
    store.templates = [{ ...customNodeTemplate(defaultCustomDefinition('CODE')), config: {}, availability: { available: false, reason: '未启用隔离运行时' } }]
    await store.saveCustomDefinitions([defaultCustomDefinition('CODE')])
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
  it('支持导出后原样导入', async () => {
    const store = useWorkflowStore(), definition = defaultCustomDefinition()
    await store.saveCustomDefinitions([definition])
    expect(JSON.parse(exportCustomDefinitions(store.customDefinitions)).nodes).toEqual([definition])
  })
  it('文件读取期间关闭窗口后，迟到的导入不会保存或污染重开的草稿', async () => {
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    let resolveRead!: (text: string) => void
    const pendingRead = new Promise<string>(resolve => { resolveRead = resolve })
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [{ size: 10, text: () => pendingRead }] })
    input.dispatchEvent(new Event('change', { bubbles: true })); await flushPromises()
    await click('取消 / 关闭'); await click('自定义节点 · API / 代码')
    resolveRead(exportCustomDefinitions([defaultCustomDefinition('CODE')])); await flushPromises()
    expect(useWorkflowStore().customDefinitions).toEqual([])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
  })
  it('等待写入锁时取消并重开，不会在锁释放后保存旧草稿', async () => {
    let release!: () => void
    lockHarness.hold(new Promise<void>(resolve => { release = resolve }))
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码'); await click('保存模板')
    expect(document.querySelector('fieldset')?.disabled).toBe(true)
    await click('取消 / 关闭'); await click('自定义节点 · API / 代码')
    release(); await flushPromises()
    expect(useWorkflowStore().customDefinitions).toEqual([])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBeNull()
    await click('保存模板')
    expect(useWorkflowStore().customDefinitions).toHaveLength(1)
  })
  it('冲突同步保留编辑草稿，重试会保留另一窗口新增的模板', async () => {
    const store = useWorkflowStore()
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    const other = useWorkflowStore(createPinia()); other.reloadCustomDefinitions()
    await other.saveCustomDefinitions([{ ...defaultCustomDefinition(), id: 'other-window' }])
    await click('保存模板')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('当前草稿未保存')
    expect([...document.querySelectorAll<HTMLInputElement>('input')].some(input => input.value === 'my-api')).toBe(true)
    await click('保存模板')
    expect(store.customDefinitions.map(definition => definition.id)).toEqual(['other-window', 'my-api'])
  })
})

describe('自定义节点模板库的版本选择', () => {
  const storedApi = {
    ...defaultCustomDefinition('API'), id: 'saved-api', version: '2.3.4', name: '已保存 API', description: '旧 API 草稿说明',
    request: { method: 'PATCH', url: 'https://example.test/old', headers: { 'X-Example': 'old' }, body: { old: true } },
  } as const
  const storedCode = {
    ...defaultCustomDefinition('CODE'), id: 'saved-code', version: '3.2.1', name: '已保存代码', description: '旧代码草稿说明',
    code: 'def main(payload):\n    return {"result": "old"}\n',
  } as const

  function control<T extends HTMLElement>(label: string, selector: string): T {
    const labels = document.querySelectorAll('section[role="dialog"] label')
    const input = [...labels].find(element => element.firstChild?.textContent?.trim() === label)?.querySelector<T>(selector)
    if (!input) throw new Error(`未找到控件：${label}`)
    return input
  }

  async function setupVersionSelection() {
    const store = useWorkflowStore()
    await store.saveCustomDefinitions([storedApi, storedCode])
    wrappers.push(mount(CustomNodeLibrary, { attachTo: document.body }))
    await click('自定义节点 · API / 代码')
    return { store, select: control<HTMLSelectElement>('编辑已有版本（变更内容需提升版本号）', 'select') }
  }

  async function choose(select: HTMLSelectElement, value: string) {
    select.focus()
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  function setName(name: string) {
    const input = control<HTMLInputElement>('名称', 'input')
    input.value = name
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  it.each([['API', storedApi], ['CODE', storedCode]] as const)('从已保存 %s 版本选择「新模板」会开始干净的默认草稿', async (kind, definition) => {
    const { store, select } = await setupVersionSelection()
    await choose(select, `${definition.id}@${definition.version}`)
    expect(control<HTMLInputElement>('模板 ID', 'input').value).toBe(definition.id)
    expect(document.querySelector('section[role="dialog"]')?.textContent).toContain(`类型：${kind}`)
    setName('未保存的编辑'); await flushPromises()
    const before = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)

    await choose(select, '')
    const fresh = defaultCustomDefinition('API')
    expect(select.value).toBe('')
    expect(document.activeElement).toBe(select)
    expect(control<HTMLInputElement>('模板 ID', 'input').value).toBe(fresh.id)
    expect(control<HTMLInputElement>('版本', 'input').value).toBe(fresh.version)
    expect(control<HTMLInputElement>('名称', 'input').value).toBe(fresh.name)
    expect(control<HTMLInputElement>('说明', 'input').value).toBe('')
    expect(control<HTMLSelectElement>('方法', 'select').value).toBe(fresh.request?.method)
    expect(control<HTMLInputElement>('URL', 'input').value).toBe(fresh.request?.url)
    expect(control<HTMLTextAreaElement>('请求头（JSON 对象）', 'textarea').value).toBe('{}')
    expect(JSON.parse(control<HTMLTextAreaElement>('JSON 请求体（留空为无请求体）', 'textarea').value)).toEqual(fresh.request?.body)
    expect(document.querySelector('section[role="dialog"]')?.textContent).not.toContain('从本机库移除')
    expect(store.customDefinitions).toEqual([storedApi, storedCode])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe(before)
  })

  it('开始新草稿清除上一版保存回执，随后显式保存只新增一份', async () => {
    const { store, select } = await setupVersionSelection()
    await choose(select, 'saved-api@2.3.4')
    await click('保存模板')
    expect(document.querySelector('[role="status"]')?.textContent).toContain('已保存到本机模板库')
    const before = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)

    await choose(select, '')
    expect(document.querySelector('[role="status"]')).toBeNull()
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe(before)
    await click('保存模板')
    expect(store.customDefinitions).toEqual([storedApi, storedCode, defaultCustomDefinition('API')])
    expect(select.value).toBe('my-api@1.0.0')
  })

  it('开始新草稿清除上一版的不可变版本报错', async () => {
    const { store, select } = await setupVersionSelection()
    await choose(select, 'saved-code@3.2.1')
    setName('有改动的同版本')
    await click('保存模板')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('请提升版本后保存')
    const before = localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)

    await choose(select, '')
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(control<HTMLInputElement>('名称', 'input').value).toBe(defaultCustomDefinition('API').name)
    expect(store.customDefinitions).toEqual([storedApi, storedCode])
    expect(localStorage.getItem(CUSTOM_NODE_STORAGE_KEY)).toBe(before)
  })

  it('切换已有版本仍加载对应类型，显式新建代码按钮仍从代码默认值开始', async () => {
    const { store, select } = await setupVersionSelection()
    await choose(select, 'saved-code@3.2.1')
    expect(control<HTMLTextAreaElement>('代码', 'textarea').value).toBe(storedCode.code)
    await choose(select, 'saved-api@2.3.4')
    expect(control<HTMLInputElement>('URL', 'input').value).toBe(storedApi.request.url)
    await click('新建代码模板')
    expect(select.value).toBe('')
    expect(control<HTMLTextAreaElement>('代码', 'textarea').value).toBe(defaultCustomDefinition('CODE').code)
    expect(store.customDefinitions).toEqual([storedApi, storedCode])
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
