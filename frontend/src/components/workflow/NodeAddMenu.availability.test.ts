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

async function openMenu() {
  const pinia = createPinia()
  const store = useWorkflowStore(pinia)
  const capabilities = unavailableWorkflowCapabilities(unavailableReason)
  store.templates = applyWorkflowCapabilities(nodeTemplates, capabilities)
  const source = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'start')!, { x: 0, y: 0 })!
  store.markSaved()

  const view = mount(WorkflowCanvas, { global: { plugins: [pinia, i18n], stubs: { CustomNodeLibrary: true } } })
  canvas = view
  await view.get(`button[aria-label="${i18n.global.t('workflow.addNextNode')}"]`).trigger('click')
  const menu = view.getComponent(NodeAddMenu)
  const option = (kind: WorkflowNodeKind) => menu.findAll('button').find(button =>
    button.text().startsWith(i18n.global.t(`workflow.catalog.items.${kind}.label`)))!
  return { view, store, source, option, capabilities }
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
