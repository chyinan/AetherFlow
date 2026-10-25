// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n } from '@/i18n'
import { nodeTemplates } from '@/services/mock/workflowMock'
import { useWorkflowStore } from '@/stores/workflowStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), saveWorkflow: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({
  currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
  subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
}) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({
  currentProject: null, loadProjects: vi.fn(), selectProject: vi.fn(), selectProjectByWorkflow: vi.fn(),
  linkWorkflowToProject: vi.fn(), updateWorkflowStatus: vi.fn(),
}) }))
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

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getWorkflow.mockResolvedValue({ id: '101', name: 'Saved', backendDefinitionId: 101, backendVersion: 1, nodes: [], edges: [] })
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({
    ...JSON.parse(JSON.stringify(workflow)), id: '101', backendDefinitionId: 101, backendVersion: 2,
  }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('拖动节点触发工作流离开确认', () => {
  it('已保存流程拖动节点后导航会显示未保存确认', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useWorkflowStore()
    vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/workflows/:id', component: WorkflowPage },
      { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
    ] })
    await router.push('/elsewhere')
    await router.push('/workflows/101')
    await router.isReady()
    wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [pinia, router, i18n], stubs: {
      teleport: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true,
      RunNodeRecoveryBanner: true, WorkflowStarterGuide: true, WorkflowPreflight: true,
    } } })
    await flushPromises()
    const start = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'start')!, { x: 0, y: 0 })!
    const end = store.addNodeFromTemplate(nodeTemplates.find(item => item.kind === 'output')!, { x: 300, y: 0 })!
    store.addConnection({ source: start.id, target: end.id, sourceHandle: null, targetHandle: null })
    store.markSaved()

    const flow = wrapper.findComponent({ name: 'VueFlow' })
    await flow.vm.$emit('node-drag-start', {}, start)
    store.nodes.find(item => item.id === start.id)!.position.x = 80
    await flow.vm.$emit('node-drag-stop', {}, start)
    expect(store.dirty).toBe(true)

    const navigation = router.push('/elsewhere')
    await flushPromises()

    expect(wrapper.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)
    await wrapper.get('[data-testid="unsaved-navigation-dialog"] [data-action="leave-stay"]').trigger('click')
    await flushPromises()
    await navigation
  })
})
