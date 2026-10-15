// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowGraphNode } from '@/types/workflow'
import WorkflowCanvas from './WorkflowCanvas.vue'

const flow = vi.hoisted(() => ({ fitView: vi.fn().mockResolvedValue(true) }))
vi.mock('@vue-flow/core', () => ({ useVueFlow: () => flow, VueFlow: { name: 'VueFlow', template: '<div><slot /></div>' } }))
vi.mock('@vue-flow/background', () => ({ Background: { template: '<div />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { template: '<div />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { template: '<div />' } }))
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers() })
function setup() {
 const pinia = createPinia(); setActivePinia(pinia)
 const store = useWorkflowStore()
 store.nodes = [{ id: 'source-node', type: 'workflow', position: { x: 1800, y: 900 }, data: { kind: 'summary', label: 'summary', description: '', inputs: [], outputs: [], status: 'idle', config: { text: '未保存输入' } } } as WorkflowGraphNode]
 store.dirty = true
 wrapper = mount(WorkflowCanvas, { global: { plugins: [pinia, i18n], stubs: { WorkflowNode: true, NodeAddMenu: true } } })
 return { store, view: wrapper, focus: (id: string) => (wrapper!.vm as unknown as { focusNode: (id: string) => Promise<void> }).focusNode(id) }
}
describe('来源运行节点的画布聚焦契约', () => {
 it('仅聚焦精确ID并在布局初始化/默认缩放后保持定位，不修改未保存图', async () => {
  const { store, view, focus } = setup(); const snapshot = JSON.stringify(store.$state)
  await focus('source-node')
  expect(flow.fitView).toHaveBeenLastCalledWith({ nodes: ['source-node'], padding: 0.4, maxZoom: 1, duration: 220 })
  view.findComponent({ name: 'VueFlow' }).vm.$emit('nodesInitialized'); await flushPromises()
  await vi.advanceTimersByTimeAsync(80)
  expect(flow.fitView.mock.calls.every(([options]) => options.nodes?.[0] === 'source-node')).toBe(true)
  expect(JSON.stringify(store.$state)).toBe(snapshot)
 })
 it('删除或不存在的节点不猜映射，也不在卸载后触发布局', async () => {
  const { store, focus } = setup()
  await focus('missing'); expect(flow.fitView).not.toHaveBeenCalled()
  await focus('source-node'); flow.fitView.mockClear()
  store.nodes = []
  await vi.advanceTimersByTimeAsync(80); expect(flow.fitView).not.toHaveBeenCalled()
  wrapper!.unmount(); wrapper = undefined
  await vi.advanceTimersByTimeAsync(200); expect(flow.fitView).not.toHaveBeenCalled()
 })
})

describe('来源定位完成后尊重新的画布操作', () => {
 async function completeInitialFocus() {
  const context = setup()
  await context.focus('source-node')
  context.view.findComponent({ name: 'VueFlow' }).vm.$emit('nodesInitialized'); await flushPromises()
  await vi.advanceTimersByTimeAsync(80)
  flow.fitView.mockClear()
  return context
 }
 async function measureNewLayout(view: ReturnType<typeof mount>) {
  view.findComponent({ name: 'VueFlow' }).vm.$emit('nodesInitialized'); await flushPromises()
 }
 it('新增并选中新节点后，不再重放旧来源定位', async () => {
  const { store, view } = await completeInitialFocus()
  const label = i18n.global.t('workflow.catalog.items.summary.label')
  await view.findAll('aside button').find(button => button.text().includes(label))!.trigger('click')
  await flushPromises()
  expect(store.nodes).toHaveLength(2)
  expect(store.nodes.find(node => node.id !== 'source-node')?.selected).toBe(true)
  await measureNewLayout(view)
  expect(flow.fitView.mock.calls.some(([options]) => options.nodes?.[0] === 'source-node')).toBe(false)
 })
 it('纯选择不会变脏，但会撤销旧来源定位', async () => {
  const { store, view } = await completeInitialFocus()
  const revision = store.editRevision
  view.findComponent({ name: 'VueFlow' }).vm.$emit('nodeClick', { node: store.nodes[0] })
  await flushPromises()
  expect(store.editRevision).toBe(revision)
  await measureNewLayout(view)
  expect(flow.fitView).not.toHaveBeenCalled()
 })
 it.each(['配置修改', '复制节点', '直接替换节点集合'] as const)('%s 后不再应用旧来源定位', async action => {
  const { store, view } = await completeInitialFocus()
  if (action === '配置修改') store.updateNodeConfig('source-node', 'text', '新的编辑')
  else if (action === '复制节点') store.duplicateNode('source-node')
  else store.nodes = [...store.nodes, { ...store.nodes[0]!, id: 'new-node' }]
  await measureNewLayout(view)
  expect(flow.fitView).not.toHaveBeenCalled()
 })
 it('纯尺寸测量和运行状态更新不取消首次布局重试', async () => {
  const { store, view, focus } = setup()
  await focus('source-node')
  flow.fitView.mockClear()
  const revision = store.editRevision
  store.setNodes(store.nodes.map(node => ({ ...node, dimensions: { width: 240, height: 160 } })))
  store.updateNodeStatus('source-node', 'failed')
  expect(store.editRevision).toBe(revision)
  await measureNewLayout(view)
  await vi.advanceTimersByTimeAsync(80)
  expect(flow.fitView).toHaveBeenCalledTimes(2)
  expect(flow.fitView.mock.calls.every(([options]) => options.nodes?.[0] === 'source-node')).toBe(true)
 })
 it('显式全图缩放取代旧来源定位', async () => {
  const { view } = await completeInitialFocus()
  await (view.vm as unknown as { fitCanvas: () => Promise<void> }).fitCanvas()
  await measureNewLayout(view)
  expect(flow.fitView).toHaveBeenCalledExactlyOnceWith({ padding: 0.2, duration: 220 })
 })
 it('取消同时撤销未完成的 nextTick 和初始化定时器，新的显式定位仍可工作', async () => {
  const { view, focus } = setup()
  const pending = focus('source-node')
  ;(view.vm as unknown as { cancelPendingFocus: () => void }).cancelPendingFocus()
  await pending
  await measureNewLayout(view)
  await vi.advanceTimersByTimeAsync(80)
  expect(flow.fitView).not.toHaveBeenCalled()
  await focus('source-node')
  expect(flow.fitView).toHaveBeenCalledExactlyOnceWith({ nodes: ['source-node'], padding: 0.4, maxZoom: 1, duration: 220 })
 })
})
