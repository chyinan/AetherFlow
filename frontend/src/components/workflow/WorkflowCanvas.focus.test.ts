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
