// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowGraphNode, WorkflowNodeKind } from '@/types/workflow'
import { applyWorkflowCapabilities, unavailableWorkflowCapabilities } from '@/utils/workflowCapability'
import NodeAddMenu from './NodeAddMenu.vue'
import WorkflowCanvas from './WorkflowCanvas.vue'

vi.mock('@vue-flow/core', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    VueFlow: defineComponent({
      props: { nodes: { type: Array<WorkflowGraphNode>, required: true }, edges: Array },
      emits: ['update:nodes', 'update:edges', 'connect', 'node-click', 'nodes-initialized', 'node-drag-start', 'node-drag-stop'],
      setup(props, { slots }) {
        return () => h('div', [slots.default?.(), props.nodes.map(node => slots['node-workflow']?.(node))])
      },
    }),
    useVueFlow: () => ({ fitView: vi.fn() }),
    Handle: { template: '<span />' },
    Position: { Left: 'left', Right: 'right' },
  }
})
vi.mock('@vue-flow/background', () => ({ Background: { template: '<span />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { template: '<span />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { template: '<span />' } }))

let canvas: ReturnType<typeof mount> | undefined
const unavailableReason = 'Test deployment: providers are not ready'

afterEach(() => {
  canvas?.unmount()
  canvas = undefined
})

async function openMenu(input: 'detached' | 'keyboard' | 'pointer' = 'detached', realLibrary = false) {
  const pinia = createPinia()
  const store = useWorkflowStore(pinia)
  const capabilities = unavailableWorkflowCapabilities(unavailableReason)
  store.templates = applyWorkflowCapabilities(nodeTemplates, capabilities)
  const source = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'start')!, { x: 0, y: 0 })!
  store.markSaved()

  const view = mount(WorkflowCanvas, {
    attachTo: input === 'detached' ? undefined : document.body,
    global: { plugins: [pinia, i18n], stubs: { CustomNodeLibrary: !realLibrary } },
  })
  canvas = view
  const opener = view.get<HTMLButtonElement>(`button[aria-label="${i18n.global.t('workflow.addNextNode')}"]`)
  if (input !== 'detached') {
    vi.spyOn(opener.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(180, 130, 28, 28))
    opener.element.focus()
  }
  if (input === 'keyboard') {
    // 原生键盘激活按钮产生 detail 为 0 的 click；jsdom 不合成按键默认动作。
    opener.element.click()
    await nextTick()
  } else {
    opener.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 250, clientY: 135 }))
    await nextTick()
  }
  const menu = view.getComponent(NodeAddMenu)
  const option = (kind: WorkflowNodeKind) => menu.findAll('button').find(button =>
    button.text().startsWith(i18n.global.t(`workflow.catalog.items.${kind}.label`)))!
  return { view, menu, store, source, option, capabilities, opener }
}

describe('节点加号菜单的能力提示', () => {
  it('在单击前就标明 LLM 不可用，与左侧节点目录一致', async () => {
    const { view, option } = await openMenu()
    const sidebar = view.get<HTMLButtonElement>('[data-node-template="llm"]')
    expect(sidebar.element.disabled).toBe(true)
    expect(sidebar.text()).toContain(unavailableReason)
    const llm = option('llm')
    expect(llm.element.disabled).toBe(true)
    expect(llm.text()).toContain(i18n.global.t('workflow.capabilityUnavailable'))
    expect(llm.text()).toContain(unavailableReason)
  })

  it('按不可用项不会关掉菜单或制造一次添加失败', async () => {
    const { view, store, source, option } = await openMenu()
    const history = store.historyPast.length
    option('llm').element.click()
    await nextTick()
    expect(store.nodes.map(node => node.id)).toEqual([source.id])
    expect(store.edges).toEqual([])
    expect(store.historyPast).toHaveLength(history)
    expect(store.dirty).toBe(false)
    expect.soft(view.findComponent(NodeAddMenu).exists()).toBe(true)
    expect(store.runError).toBeNull()
  })

  it('目录将打开的选项改为不可用后，点击该选项内部文字也不提交', async () => {
    const { view, store, source, option, capabilities } = await openMenu()
    store.templates = applyWorkflowCapabilities(nodeTemplates, { ...capabilities, executableNodeTypes: ['LLM'] })
    await nextTick()
    expect(option('llm').element.disabled).toBe(false)

    store.templates = applyWorkflowCapabilities(nodeTemplates, capabilities)
    await nextTick()
    const history = store.historyPast.length
    const llm = option('llm')
    expect.soft(llm.element.disabled).toBe(true)
    const label = llm.findAll('span').find(span => span.text() === i18n.global.t('workflow.catalog.items.llm.label'))
    expect(label).toBeDefined()
    label!.element.click()
    await nextTick()

    expect(store.nodes.map(node => node.id)).toEqual([source.id])
    expect(store.edges).toEqual([])
    expect(store.historyPast).toHaveLength(history)
    expect(store.dirty).toBe(false)
    expect.soft(view.findComponent(NodeAddMenu).exists()).toBe(true)
    expect(store.runError).toBeNull()
  })

  it.each(['image-generation', 'upscale', 'whisper'] as const)('提示 %s 当前环境不可用，但仍可添加并配置', async (kind) => {
    const { view, store, source, option } = await openMenu()
    const row = option(kind)
    expect(row.element.disabled).toBe(false)
    expect(row.text()).toContain(unavailableReason)
    row.element.click()
    await nextTick()
    const added = store.nodes.find(node => node.data.kind === kind)!
    expect(store.edges).toEqual([expect.objectContaining({ source: source.id, target: added.id })])
    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
  })

  it('正常非模型节点仍添加并连接，不显示不可用理由', async () => {
    const { view, store, source, option } = await openMenu()
    const prompt = option('prompt')
    expect(prompt.element.disabled).toBe(false)
    expect(prompt.text()).not.toContain(unavailableReason)
    prompt.element.click()
    await nextTick()
    const added = store.nodes.find(node => node.data.kind === 'prompt')!
    expect(store.edges).toEqual([expect.objectContaining({ source: source.id, target: added.id })])
    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
  })

  it('菜单打开时若目录恢复，原选项重新可选且不保留过时原因', async () => {
    const { view, store, source, option, capabilities } = await openMenu()
    store.templates = applyWorkflowCapabilities(nodeTemplates, { ...capabilities, executableNodeTypes: ['LLM'] })
    await nextTick()
    const llm = option('llm')
    expect(llm.element.disabled).toBe(false)
    expect(llm.text()).not.toContain(unavailableReason)
    llm.element.click()
    await nextTick()
    const added = store.nodes.find(node => node.data.kind === 'llm')!
    expect(store.edges).toEqual([expect.objectContaining({ source: source.id, target: added.id })])
    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
  })
})

describe('节点加号菜单的条目详情', () => {
  it('键盘聚焦的节点切换到工具后不再显示，返回时也不会恢复旧详情', async () => {
    const { menu, option, store } = await openMenu()
    const nodesTab = menu.findAll('button').find(button => button.text() === i18n.global.t('workflow.catalog.tabs.nodes'))!
    const toolsTab = menu.findAll('button').find(button => button.text() === i18n.global.t('workflow.catalog.tabs.tools'))!
    await option('prompt').trigger('focus')
    expect(menu.get('aside').text()).toContain(i18n.global.t('workflow.catalog.items.prompt.label'))

    await toolsTab.trigger('click')
    expect(option('prompt')).toBeUndefined()
    expect(menu.find('aside').exists()).toBe(false)

    await nodesTab.trigger('click')
    expect(option('prompt')).toBeDefined()
    expect(menu.find('aside').exists()).toBe(false)
    await option('prompt').trigger('focus')
    expect(menu.get('aside').text()).toContain(i18n.global.t('workflow.catalog.items.prompt.label'))
    expect(store.dirty).toBe(false)
  })

  it('搜索仍包含悬停项时保留详情，排除后不展示或在清空时恢复它', async () => {
    const { menu, option } = await openMenu()
    const search = menu.get('input')
    await option('prompt').trigger('mouseenter')
    const details = menu.get('aside').text()

    await search.setValue('prompt')
    expect(menu.get('aside').text()).toBe(details)
    await search.setValue('synthetic-node-that-does-not-exist')
    expect(menu.text()).toContain(i18n.global.t('common.noResult'))
    expect(menu.find('aside').exists()).toBe(false)

    await search.setValue('')
    expect(option('prompt')).toBeDefined()
    expect(menu.find('aside').exists()).toBe(false)
    await option('prompt').trigger('mouseenter')
    expect(menu.get('aside').text()).toBe(details)
  })

  it('目录替换同类条目时不继续展示旧输出，重新聚焦才能查看新输出', async () => {
    const { menu, option, store } = await openMenu()
    await option('prompt').trigger('focus')
    const oldOutputs = store.templates.find(template => template.kind === 'prompt')!.outputs
    expect(oldOutputs.length).toBeGreaterThan(0)
    expect(menu.get('aside').text()).toContain(oldOutputs[0]!)

    store.templates = store.templates.map(template => template.kind === 'prompt'
      ? { ...template, outputs: ['syntheticNewOutput'] }
      : template)
    await nextTick()
    expect(option('prompt')).toBeDefined()
    expect(menu.find('aside').exists()).toBe(false)

    await option('prompt').trigger('focus')
    expect(menu.get('aside').text()).toContain('syntheticNewOutput')
  })

  it('只替换其他目录项时保留当前可见项的输出详情', async () => {
    const { menu, option, store } = await openMenu()
    await option('prompt').trigger('focus')
    const details = menu.get('aside').text()
    store.templates = store.templates.map(template => template.kind === 'llm' ? { ...template } : template)
    await nextTick()
    expect(menu.get('aside').text()).toBe(details)
  })
})

describe('节点加号菜单的键盘焦点', () => {
  it('通过键盘打开时可直接搜索；关闭后再次打开也能搜索', async () => {
    const { view, menu, opener, store } = await openMenu('keyboard')
    const search = menu.get<HTMLInputElement>('input')
    expect(document.activeElement).toBe(search.element)
    await search.setValue('prompt')
    expect(menu.findAll('button').some(button => button.text().startsWith(i18n.global.t('workflow.catalog.items.prompt.label')))).toBe(true)

    await menu.get<HTMLButtonElement>(`button[title="${i18n.global.t('common.close')}"]`).trigger('click')
    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
    opener.element.click()
    await nextTick()
    const reopened = view.getComponent(NodeAddMenu).get<HTMLInputElement>('input')
    expect(document.activeElement).toBe(reopened.element)
    expect(reopened.element.value).toBe('')
    expect(store.dirty).toBe(false)
  })

  it.each([
    ['keyboard', '218px', '106px'],
    ['pointer', '260px', '111px'],
  ] as const)('%s 打开时分别沿用加号按钮或指针的坐标', async (input, left, top) => {
    const { menu } = await openMenu(input)
    expect((menu.element as HTMLElement).style.left).toBe(left)
    expect((menu.element as HTMLElement).style.top).toBe(top)
  })

  it.each(['搜索框', '节点选项'] as const)('在%s按 Escape 只关闭菜单，并返回原节点按钮', async target => {
    const { view, menu, opener, option, store, source } = await openMenu('keyboard')
    const field = target === '搜索框' ? menu.get('input') : option('prompt')
    field.element.focus()
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    field.element.dispatchEvent(event)
    await nextTick()

    expect.soft(view.findComponent(NodeAddMenu).exists()).toBe(false)
    expect.soft(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(opener.element)
    expect(store.nodes.map(node => node.id)).toEqual([source.id])
    expect(store.edges).toEqual([])
    expect(store.dirty).toBe(false)
  })

  it('显式关闭时，焦点离开即将移除的关闭按钮并返回触发入口', async () => {
    const { view, menu, opener } = await openMenu('pointer')
    expect(document.activeElement).toBe(opener.element)
    const close = menu.get<HTMLButtonElement>(`button[title="${i18n.global.t('common.close')}"]`)
    close.element.focus()
    close.element.click()
    await nextTick()

    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
  })

  it('输入法组合输入中的 Escape 不关闭菜单', async () => {
    const { view, menu } = await openMenu('keyboard')
    const search = menu.get<HTMLInputElement>('input')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })
    search.element.dispatchEvent(event)
    await nextTick()

    expect(view.findComponent(NodeAddMenu).exists()).toBe(true)
    expect(event.defaultPrevented).toBe(false)
  })

  it('自定义节点模板库消费第一次 Escape，不同时关闭外面的菜单', async () => {
    const { view, menu, opener } = await openMenu('keyboard', true)
    const library = menu.findAll('button').find(button => button.text() === '自定义节点 · API / 代码')!
    library.element.focus()
    library.element.click()
    await nextTick()
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="自定义节点模板库"]')!
    expect(document.activeElement).toBe(dialog)
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    expect(dialog.isConnected).toBe(false)
    expect(view.findComponent(NodeAddMenu).exists()).toBe(true)
    expect(document.activeElement).toBe(library.element)

    library.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
    expect(document.activeElement).toBe(opener.element)
  })

  it('单击菜单外的画布搜索框时保留新焦点，而不把焦点拉回原节点', async () => {
    const { view } = await openMenu('keyboard')
    const outside = view.get<HTMLInputElement>('input[type="search"]')
    outside.element.focus()
    await outside.trigger('click')

    expect(view.findComponent(NodeAddMenu).exists()).toBe(false)
    expect(document.activeElement).toBe(outside.element)
  })
})
