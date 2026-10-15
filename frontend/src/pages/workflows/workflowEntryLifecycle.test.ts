// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useProjectStore } from '@/stores/projectStore'
import { useRunStore } from '@/stores/runStore'
import { useFileStore } from '@/stores/fileStore'
import type { WorkflowDefinition } from '@/types/workflow'
import WorkflowPage from './WorkflowPage.vue'

const api = vi.hoisted(() => ({ getWorkflow: vi.fn(), listWorkflowTemplates: vi.fn() }))
vi.mock('@/services/api/workflowApi', async original => ({
  ...await original<typeof import('@/services/api/workflowApi')>(), workflowApi: api,
}))
vi.mock('@/services/realtime/realtimeClient', () => ({ realtimeClient: { subscribeRun: vi.fn(() => vi.fn()) } }))
function deferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}
function definition(id: string): WorkflowDefinition {
  return {
    id, name: `工作流${id}`, backendDefinitionId: /^\d+$/.test(id) ? Number(id) : undefined, backendVersion: 1,
    nodes: [{ id: 'start', type: 'workflow', position: { x: 0, y: 0 }, data: {
      kind: 'start', label: '开始', description: '', status: 'idle', config: { fileId: 7 }, inputs: [], outputs: [],
    } }], edges: [],
  }
}
function canvasState(store: ReturnType<typeof useWorkflowStore>) {
  const { workflowId, workflowName, backendDefinitionId, backendVersion, projectId, nodes, edges, dirty, editRevision, historyPast, historyFuture, loadingError, savingError, runError } = store
  return JSON.stringify({ workflowId, workflowName, backendDefinitionId, backendVersion, projectId, nodes, edges, dirty, editRevision, historyPast, historyFuture, loadingError, savingError, runError })
}
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.getWorkflow.mockImplementation(async (id: string) => definition(id))
  api.listWorkflowTemplates.mockResolvedValue([definition('template')])
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks() })
async function setup(stage: 'files' | 'projects' | 'catalog' | 'history' = 'files') {
  const pinia = createPinia(); setActivePinia(pinia)
  const store = useWorkflowStore(); const runs = useRunStore(); const pending = deferred()
  vi.spyOn(store, 'loadNodeTemplates').mockImplementationOnce(async () => { if (stage === 'catalog') await pending.promise; return true }).mockResolvedValue(true)
  vi.spyOn(useProjectStore(), 'loadProjects').mockImplementationOnce(async () => { if (stage === 'projects') await pending.promise }).mockResolvedValue(undefined)
  vi.spyOn(useFileStore(), 'loadFiles').mockImplementationOnce(async () => { if (stage === 'files') await pending.promise }).mockResolvedValue(undefined)
  vi.spyOn(runs, 'loadRuns').mockImplementationOnce(async () => { if (stage === 'history') await pending.promise }).mockResolvedValue(undefined)
  vi.spyOn(runs, 'selectRunForWorkflow').mockResolvedValue(null)
  const cleared = vi.spyOn(runs, 'clearCurrentRun')
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/workflows/:id', component: WorkflowPage },
    { path: '/other', component: { template: '<p>其他页面</p>' } },
  ] })
  await router.push('/workflows/new'); await router.isReady()
  wrapper = mount(RouterView, { global: {
    plugins: [pinia, router, i18n],
    stubs: { WorkflowCanvas: true, NodeInspector: true, RunConsole: true, AICopilotPanel: true },
  } })
  await flushPromises()
  return { router, store, runs, cleared, pending }
}
describe('空白工作流入口的迟到初始化', () => {
  it.each(['files', 'projects', 'catalog', 'history'] as const)('%s 辅助读取未完成时进入已保存工作流，旧初始化不能清空新画布或撤销历史', async stage => {
    const { router, store, cleared, pending } = await setup(stage)
    await router.push('/workflows/101'); await flushPromises()
    expect(store.workflowId).toBe('101')
    store.updateNodeConfig('start', 'fileId', 88)
    const before = canvasState(store)
    const clearedBefore = cleared.mock.calls.length
    pending.resolve(); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/workflows/101')
    expect(canvasState(store)).toBe(before)
    expect(cleared).toHaveBeenCalledTimes(clearedBefore)
    expect(store.undo()).toBe(true)
    expect(store.nodes[0]!.data.config.fileId).toBe(7)
  })
  it('进入命名草稿并通过模板按钮应用后，旧空白入口不能抹掉新模板', async () => {
    const { router, store, pending } = await setup()
    await router.push('/workflows/new?name=新草稿'); await flushPromises()
    await wrapper!.get('[data-action="workflow-templates"]').trigger('click'); await flushPromises()
    await wrapper!.findAll('[role="dialog"] button').find(button => button.text().includes('工作流template'))!.trigger('click')
    await flushPromises()
    expect(store.dirty).toBe(true)
    const before = canvasState(store)
    pending.resolve(); await flushPromises()
    expect(canvasState(store)).toBe(before)
    expect(store.nodes).toHaveLength(1)
  })
  it('离开空白入口后重新进入工作流，已卸载入口的旧初始化不能清空新页面', async () => {
    const { router, store, pending } = await setup()
    await router.push('/other'); await flushPromises()
    await router.push('/workflows/202'); await flushPromises()
    expect(store.workflowId).toBe('202')
    const before = canvasState(store)
    pending.resolve(); await flushPromises()
    expect(canvasState(store)).toBe(before)
  })
  it('旧辅助请求失败也不会清空当前工作流，空白入口仍可正常进入', async () => {
    const { router, store, pending } = await setup()
    expect(store.workflowId).toBe('new'); expect(store.nodes).toEqual([])
    await router.push('/workflows/101'); await flushPromises()
    const before = canvasState(store)
    pending.reject(new Error('旧文件列表暂时不可用')); await flushPromises()
    expect(canvasState(store)).toBe(before)
  })

})
