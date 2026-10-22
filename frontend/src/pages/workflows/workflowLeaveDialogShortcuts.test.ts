// @vitest-environment jsdom
// 离开确认弹窗打开时必须隔离画布撤销/重做快捷键，
// 否则弹窗里的 Ctrl/Cmd+Z 会改动画布，随后保存并离开的是非预期版本。
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
const projects = vi.hoisted(() => ({ linkWorkflowToProject: vi.fn(), updateWorkflowStatus: vi.fn() }))
vi.mock('@/services/api/workflowApi', async (original) => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/stores/runStore', () => ({ useRunStore: () => ({
  currentRun: null, logs: [], loadRuns: vi.fn(), selectRunForWorkflow: vi.fn(),
  subscribeCurrentRun: vi.fn(), clearCurrentRun: vi.fn(),
}) }))
vi.mock('@/stores/fileStore', () => ({ useFileStore: () => ({ loadFiles: vi.fn() }) }))
vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => ({
  currentProject: null, loadProjects: vi.fn(), selectProject: vi.fn(), selectProjectByWorkflow: vi.fn(), ...projects,
}) }))

function definition(id: string): WorkflowDefinition {
  return { id, name: `Workflow ${id}`, backendDefinitionId: Number(id), backendVersion: 1, nodes: [], edges: [] }
}

let wrapper: ReturnType<typeof mount> | undefined

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.saveWorkflow.mockImplementation(async (workflow: WorkflowDefinition) => ({
    ...JSON.parse(JSON.stringify(workflow)), id: '201', backendDefinitionId: 201, backendVersion: 2,
  }))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function setup(path = '/workflows/101?projectId=11') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkflowStore()
  vi.spyOn(store, 'loadNodeTemplates').mockResolvedValue(true)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/elsewhere', component: { template: '<div>其他页面</div>' } },
  ] })
  await router.push('/elsewhere')
  await router.push(path)
  await router.isReady()
  wrapper = mount(RouterView, { attachTo: document.body, global: {
    plugins: [pinia, router, i18n],
    stubs: { teleport: true, WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true, RunNodeRecoveryBanner: true },
  } })
  await flushPromises()
  const start = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'start')!, { x: 0, y: 0 })!
  const end = store.addNodeFromTemplate(nodeTemplates.find((template) => template.kind === 'output')!, { x: 300, y: 0 })!
  store.addConnection({ source: start.id, target: end.id, sourceHandle: null, targetHandle: null })
  await flushPromises()
  return { store, router, start }
}

function dialog() { return wrapper!.get('[data-testid="unsaved-navigation-dialog"]') }

describe('离开确认弹窗期间的画布快捷键', () => {
  it('弹窗打开时 Ctrl/Cmd+Z 不撤销画布', async () => {
    const { store, router, start } = await setup()
    store.updateNodeConfig(start.id, 'description', '弹窗前的修改')
    await flushPromises()
    const historyBefore = store.historyPast.length

    const navigation = router.push('/elsewhere')
    await flushPromises()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)

    // 焦点在弹窗按钮上时按 Ctrl+Z：画布不得被撤销。
    const button = dialog().get('[data-action="leave-stay"]')
    ;(button.element as HTMLElement).focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await flushPromises()

    expect(store.historyPast.length).toBe(historyBefore)
    expect(store.nodes.find((node) => node.id === start.id)?.data.config.description).toBe('弹窗前的修改')

    await dialog().get('[data-action="leave-stay"]').trigger('click')
    await flushPromises()
    await navigation
  })

  it('弹窗打开时 Ctrl/Cmd+Shift+Z 与 Ctrl/Cmd+Y 不重做画布', async () => {
    const { store, router, start } = await setup()
    store.updateNodeConfig(start.id, 'description', '第一次修改')
    await flushPromises()
    store.undo()
    await flushPromises()
    const historyAfter = store.historyPast.length

    const navigation = router.push('/elsewhere')
    await flushPromises()
    expect(wrapper!.find('[data-testid="unsaved-navigation-dialog"]').exists()).toBe(true)

    ;(dialog().get('[data-action="leave-save"]').element as HTMLElement).focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }))
    await flushPromises()

    expect(store.historyPast.length).toBe(historyAfter)
    expect(store.nodes.find((node) => node.id === start.id)?.data.config.description).not.toBe('第一次修改')

    await dialog().get('[data-action="leave-stay"]').trigger('click')
    await flushPromises()
    await navigation
  })

  it('弹窗关闭后撤销快捷键恢复可用', async () => {
    const { store, router, start } = await setup()
    store.updateNodeConfig(start.id, 'description', '可撤销的修改')
    await flushPromises()

    const navigation = router.push('/elsewhere')
    await flushPromises()
    await dialog().get('[data-action="leave-stay"]').trigger('click')
    await flushPromises()
    await navigation

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))
    await flushPromises()

    expect(store.nodes.find((node) => node.id === start.id)?.data.config.description).not.toBe('可撤销的修改')
  })
})
