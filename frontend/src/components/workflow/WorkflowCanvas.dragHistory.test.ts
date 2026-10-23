// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition, WorkflowGraphNode } from '@/types/workflow'
import WorkflowCanvas from './WorkflowCanvas.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@vue-flow/core', async () => {
  const { defineComponent: component, h: render } = await import('vue')
  return {
    VueFlow: component({
      name: 'VueFlow',
      props: { nodes: { type: Array, default: () => [] }, edges: { type: Array, default: () => [] } },
      emits: ['update:nodes', 'update:edges', 'connect', 'node-click', 'nodes-initialized', 'node-drag-start', 'node-drag-stop'],
      setup(_props, { slots }) { return () => render('div', { 'data-testid': 'vue-flow' }, slots.default?.()) },
    }),
    useVueFlow: () => ({ fitView: vi.fn(), screenToFlowCoordinate: (point: { x: number; y: number }) => point }),
  }
})
vi.mock('@vue-flow/background', async () => {
  const { defineComponent: component } = await import('vue')
  return { Background: component({ name: 'Background', setup: () => () => null }) }
})
vi.mock('@vue-flow/controls', async () => {
  const { defineComponent: component } = await import('vue')
  return { Controls: component({ name: 'Controls', setup: () => () => null }) }
})
vi.mock('@vue-flow/minimap', async () => {
  const { defineComponent: component } = await import('vue')
  return { MiniMap: component({ name: 'MiniMap', setup: () => () => null }) }
})

const node = (id: string, x: number, y: number, selected = false): WorkflowGraphNode => ({
  id, type: 'workflow', position: { x, y }, selected,
  data: { kind: 'start', label: id, description: '', config: {}, inputs: [], outputs: [], status: 'idle' },
})
const saved = (workflow: WorkflowDefinition): WorkflowDefinition => ({
  ...JSON.parse(JSON.stringify(workflow)), id: '101', backendDefinitionId: 101, backendVersion: 2,
})

let wrapper: VueWrapper | undefined
let latestSaved: WorkflowDefinition | null = null

beforeEach(() => {
  vi.resetAllMocks()
  latestSaved = null
  api.getWorkflow.mockImplementation(async () => latestSaved ?? saved({
    id: '101', name: 'Saved', backendDefinitionId: 101, backendVersion: 2,
    nodes: [node('a', 0, 0)], edges: [],
  }))
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => {
    latestSaved = saved(workflow)
    return latestSaved
  })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(nodes: WorkflowGraphNode[] = [node('a', 0, 0)]) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  store.workflowId = '101'
  store.workflowName = 'Saved'
  store.backendDefinitionId = 101
  store.backendVersion = 1
  store.nodes = nodes
  store.edges = []
  store.dirty = false
  store.editRevision = 0
  store.historyPast = []
  store.historyFuture = []
  wrapper = mount(WorkflowCanvas, { attachTo: document.body, global: {
    plugins: [pinia, i18n],
    stubs: { WorkflowNode: true, NodeAddMenu: true },
  } })
  await flushPromises()
  return { store, flow: wrapper.findComponent({ name: 'VueFlow' }) }
}

describe('画布节点拖动历史事务', () => {
  it('真实画布拖动结束时一次性标记未保存并支持 Undo/Redo', async () => {
    const { store, flow } = await setup()
    const startRevision = store.editRevision

    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 40
    store.nodes[0]!.position.y = 20
    expect(store.dirty).toBe(false)
    expect(store.historyPast).toHaveLength(0)

    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])

    expect(store.dirty).toBe(true)
    expect(store.editRevision).toBe(startRevision + 1)
    expect(store.historyPast).toHaveLength(1)
    expect(store.historyPast[0]!.nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(store.redo()).toBe(true)
    expect(store.nodes[0]!.position).toEqual({ x: 40, y: 20 })
  })

  it('无位移拖动不产生脏状态或历史', async () => {
    const { store, flow } = await setup()

    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])

    expect(store.dirty).toBe(false)
    expect(store.editRevision).toBe(0)
    expect(store.historyPast).toHaveLength(0)
  })

  it('多选节点的一次拖动只产生一个历史快照', async () => {
    const { store, flow } = await setup([node('a', 0, 0, true), node('b', 100, 0, true)])

    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 25
    store.nodes[1]!.position.x = 125
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])

    expect(store.historyPast).toHaveLength(1)
    expect(store.historyPast[0]!.nodes.map(item => item.position.x)).toEqual([0, 100])
    expect(store.nodes.map(item => item.position.x)).toEqual([25, 125])
  })

  it('连续拖动分别记为事务，不按每帧堆叠历史', async () => {
    const { store, flow } = await setup()

    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 10
    store.nodes[0]!.position.x = 15
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])
    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 30
    store.nodes[0]!.position.x = 45
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])

    expect(store.historyPast).toHaveLength(2)
    expect(store.historyPast.map(entry => entry.nodes[0]!.position.x)).toEqual([0, 15])
    expect(store.nodes[0]!.position.x).toBe(45)
  })

  it('保存并重新打开后保留拖动布局', async () => {
    const { store, flow } = await setup()
    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 64
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])

    await store.saveCurrentWorkflow()
    expect(store.dirty).toBe(false)
    expect(api.saveWorkflow.mock.calls[0]![0].nodes[0]!.position).toEqual({ x: 64, y: 0 })
    await store.loadWorkflow('101')
    expect(store.nodes[0]!.position).toEqual({ x: 64, y: 0 })
  })

  it('拖动期间保存后继续移动，迟到的保存回执不会清除新修改', async () => {
    let resolveSave!: (value: WorkflowDefinition) => void
    api.saveWorkflow.mockReturnValueOnce(new Promise<WorkflowDefinition>(resolve => { resolveSave = resolve }))
    const { store, flow } = await setup()
    await flow.vm.$emit('node-drag-start', {}, store.nodes[0])
    store.nodes[0]!.position.x = 20
    const saving = store.saveCurrentWorkflow()
    await flushPromises()
    store.nodes[0]!.position.x = 50
    await flow.vm.$emit('node-drag-stop', {}, store.nodes[0])
    resolveSave(saved(api.saveWorkflow.mock.calls[0]![0]))
    await saving

    expect(store.nodes[0]!.position.x).toBe(50)
    expect(store.dirty).toBe(true)
    expect(api.saveWorkflow.mock.calls[0]![0].nodes[0]!.position.x).toBe(20)
  })
})
